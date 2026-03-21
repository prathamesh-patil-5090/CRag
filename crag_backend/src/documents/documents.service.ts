import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import 'multer';
import { S3_PROVIDER } from 'src/common/s3.provider';
import { OrgRole } from 'src/membership/entities/membership.entity';
import { MembershipService } from 'src/membership/membership.service';
import { OrganizationService } from 'src/organization/organization.service';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { CreateDocumentDto } from './dto/create-document.dto';
import { Document, DocumentStatus } from './entities/document.entity';

type RequestUser = { id?: string; sub?: string };
const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private bucket = process.env.MINIO_BUCKET || '';

  private readonly embeddingModel = 'nvidia/llama-nemotron-embed-vl-1b-v2:free';

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    private readonly membershipService: MembershipService,
    private readonly orgService: OrganizationService,
    @InjectQueue('documents') private readonly documentsQueue: Queue,
    @Inject(S3_PROVIDER) private readonly s3Client: S3Client,
  ) {}

  private getUserId(user: RequestUser): string {
    const id = user?.id ?? user?.sub;
    if (!id) {
      throw new ForbiddenException('Login Expired. Please login again!');
    }
    return id;
  }

  private async assertMembership(userId: string, orgId: string): Promise<void> {
    const membership = await this.membershipService.findByUserIdAndOrgId(
      userId,
      orgId,
    );
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }

  private async uploadFileToS3(
    file: Express.Multer.File,
    s3Key: string,
  ): Promise<void> {
    let Body:
      | Express.Multer.File
      | undefined
      | fs.ReadStream
      | Buffer<ArrayBufferLike>;

    if (file.buffer && file.buffer.length) {
      Body = file.buffer;
    } else if (file.path) {
      Body = fs.createReadStream(file.path);
    } else {
      throw new BadRequestException('Invalid file payload');
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body,
        ContentType: file.mimetype,
      }),
    );

    if (file.path) {
      try {
        await unlinkAsync(file.path);
      } catch (e) {
        this.logger.warn(
          `Failed to delete temp file ${file.path}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async createDocumentRecord(
    orgId: string,
    userId: string,
    fileUrl: string,
  ): Promise<Document> {
    const document = this.documentRepo.create({
      orgId,
      uploadedBy: userId,
      fileUrl,
      status: DocumentStatus.PROCESSING,
    });
    await this.documentRepo.save(document);

    // Enqueue job with richer context for the processor
    await this.documentsQueue.add('process-document', {
      documentId: document.id,
      fileUrl,
      orgId,
      uploadedBy: userId,
      embeddingModel: this.embeddingModel,
      provider: 'openrouter',
    });

    return document;
  }

  async findAllForOrg(userId: string, orgId: string): Promise<Document[]> {
    await this.assertMembership(userId, orgId);

    return this.documentRepo.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
    });
  }

  async uploadCompanyDocs(
    files: Express.Multer.File[] | undefined,
    user: RequestUser,
    dto: CreateDocumentDto,
  ): Promise<Document[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const userId = this.getUserId(user);
    await this.assertMembership(userId, dto.orgId);

    const userRole = await this.membershipService.findByUserIdAndOrgId(
      userId,
      dto.orgId,
    );
    if (!userRole) {
      throw new NotFoundException('This user has no role in this organization');
    }

    if (![OrgRole.HR, OrgRole.OWNER].includes(userRole.role)) {
      throw new ForbiddenException(
        'Only HR or Owner users have permission to upload company files',
      );
    }

    const org = await this.orgService.findOne(dto.orgId);
    if (!org) {
      throw new NotFoundException("Organization with this id doesn't exist");
    }

    const uploadedDocs: Document[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      try {
        const key = `org/${org.orgName.replaceAll(' ', '_')}/company/${Date.now()}_${file.originalname}`;
        await this.uploadFileToS3(file, key);

        const s3Url = `s3://${this.bucket}/${key}`;
        const doc = await this.createDocumentRecord(dto.orgId, userId, s3Url);
        uploadedDocs.push(doc);

        this.logger.log(
          `Company document uploaded: ${file.originalname} by user ${userId}`,
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push({ file: file.originalname, error: errorMsg });
        this.logger.error(
          `Failed to upload company document ${file.originalname}: ${errorMsg}`,
        );
      }
    }

    if (uploadedDocs.length === 0 && errors.length > 0) {
      throw new BadRequestException(
        `All files failed to upload: ${errors.map((e) => `${e.file}: ${e.error}`).join('; ')}`,
      );
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Partial upload: ${uploadedDocs.length} succeeded, ${errors.length} failed`,
      );
    }

    return uploadedDocs;
  }

  async upload(
    files: Express.Multer.File[] | undefined,
    user: RequestUser,
    dto: CreateDocumentDto,
  ): Promise<Document[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const userId = this.getUserId(user);
    await this.assertMembership(userId, dto.orgId);

    const userRole = await this.membershipService.findByUserIdAndOrgId(
      userId,
      dto.orgId,
    );
    if (!userRole) {
      throw new NotFoundException('This user has no role in this organization');
    }

    const org = await this.orgService.findOne(dto.orgId);
    if (!org) {
      throw new NotFoundException("Organization with this id doesn't exist");
    }

    const uploadedDocs: Document[] = [];
    const errors: Array<{ file: string; error: string }> = [];

    for (const file of files) {
      try {
        const userName = userRole.user
          ? `${userRole.user.firstName || ''}_${userRole.user.lastName || ''}`.replace(
              /(^_|_$)/g,
              '',
            ) || 'unknown'
          : 'unknown';
        const key = `org/${org.orgName.replaceAll(' ', '_')}/users/${userRole.role}/${userId}_${userName}/${Date.now()}_${file.originalname}`;
        await this.uploadFileToS3(file, key);

        const s3Url = `s3://${this.bucket}/${key}`;
        const doc = await this.createDocumentRecord(dto.orgId, userId, s3Url);
        uploadedDocs.push(doc);

        this.logger.log(
          `Document uploaded: ${file.originalname} by user ${userId} in role ${userRole.role}`,
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        errors.push({ file: file.originalname, error: errorMsg });
        this.logger.error(
          `Failed to upload document ${file.originalname}: ${errorMsg}`,
        );
      }
    }

    if (uploadedDocs.length === 0 && errors.length > 0) {
      throw new BadRequestException(
        `All files failed to upload: ${errors.map((e) => `${e.file}: ${e.error}`).join('; ')}`,
      );
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Partial upload: ${uploadedDocs.length} succeeded, ${errors.length} failed`,
      );
    }

    return uploadedDocs;
  }

  async remove(
    documentId: string,
    user: RequestUser,
  ): Promise<{ message: string }> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const userId = this.getUserId(user);
    await this.assertMembership(userId, doc.orgId);

    await this.documentRepo.delete(documentId);
    return { message: 'Document deleted successfully' };
  }

  async getDownloadUrl(s3Url: string, expiresIn = 3600): Promise<string> {
    // Fixed string regex replacement
    const cleaned = s3Url.replace(/^s3:\/\//, '');
    const [bucket, ...rest] = cleaned.split('/');
    if (!bucket || rest.length === 0) {
      throw new BadRequestException('Invalid s3 url');
    }
    const key = rest.join('/');
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Client, cmd, { expiresIn });
  }
}
