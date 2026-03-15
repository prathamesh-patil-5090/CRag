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
import { MembershipService } from 'src/membership/membership.service';
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

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    private readonly membershipService: MembershipService,
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

  async findAllForOrg(userId: string, orgId: string): Promise<Document[]> {
    await this.assertMembership(userId, orgId);

    return this.documentRepo.find({
      where: { orgId },
      order: { createdAt: 'DESC' },
    });
  }

  async upload(
    file: Express.Multer.File | undefined,
    user: RequestUser,
    dto: CreateDocumentDto,
  ): Promise<Document> {
    if (!file) throw new BadRequestException('File is required');

    const userId = this.getUserId(user);
    await this.assertMembership(userId, dto.orgId);

    const key = `orgs/${dto.orgId}/${Date.now()}_${file.originalname}`;

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
        Key: key,
        Body,
        ContentType: file.mimetype,
      }),
    );

    if (file.path) {
      try {
        await unlinkAsync(file.path);
      } catch (e) {
        this.logger.error(
          `Error catched during deleting local temp file - ${e}`,
        );
      }
    }

    const s3Url: string = `s3://${this.bucket}/${key}`;

    const document = this.documentRepo.create({
      orgId: dto.orgId,
      uploadedBy: userId,
      fileUrl: s3Url,
      status: DocumentStatus.PROCESSING,
    });
    await this.documentRepo.save(document);

    await this.documentsQueue.add('process-document', {
      documentId: document.id,
    });

    return document;
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
    const cleaned = s3Url.replace('/^s3:///', '');
    const [bucket, ...rest] = cleaned.split('/');
    if (!bucket || rest.length === 0) {
      throw new BadRequestException('Invalid s3 url');
    }
    const key = rest.join('/');
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Client, cmd, { expiresIn });
  }
}
