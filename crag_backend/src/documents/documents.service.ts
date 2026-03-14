import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import 'multer';
import { MembershipService } from 'src/membership/membership.service';
import { Repository } from 'typeorm';
import { CreateDocumentDto } from './dto/create-document.dto';
import { Document, DocumentStatus } from './entities/document.entity';
import { S3_PROVIDER } from 'src/common/s3.provider';
import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import { promisify } from 'util';

type RequestUser = { id?: string; sub?: string };

const unlinkAsync = promisify(fs.unlink);

@Injectable()
export class DocumentsService {
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

    const bucket = process.env.MINIO_BUCKET || 'test-bucket';
    const key = `orgs/${dto.orgId}/${Date.now()}_${file.originalname}`;

    // build Body from buffer or disk path
    let Body: any;
    if (file.buffer && file.buffer.length) {
      Body = file.buffer;
    } else if (file.path) {
      Body = fs.createReadStream(file.path);
    } else {
      throw new BadRequestException('Invalid file payload');
    }

    // upload to MinIO
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body,
        ContentType: file.mimetype,
      }),
    );

    // optionally remove local temp file if diskStorage used
    if (file.path) {
      try {
        await unlinkAsync(file.path);
      } catch (e) {}
    }

    // store s3 path in DB
    const s3Url = `s3://${bucket}/${key}`;

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
    const { 1: bucket, ...rest } = s3Url.replace('s3://', '').split('/');
    const key = s3Url.replace(`s3://${bucket}/`, '');
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3Client, cmd, { expiresIn });
  }
}
