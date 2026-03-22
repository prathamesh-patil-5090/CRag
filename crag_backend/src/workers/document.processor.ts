import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Job } from 'bullmq';
import { Db, MongoClient } from 'mongodb';
import { PDFParse } from 'pdf-parse';
import { S3_PROVIDER } from 'src/common/s3.provider';

import {
  Document,
  DocumentStatus,
} from 'src/documents/entities/document.entity';
import { Repository } from 'typeorm';

export interface ProcessDocumentJob {
  documentId: string;
  fileUrl: string;
  orgId: string;
  uploadedBy: string;
  embeddingModel: string;
  provider: string;
}

export interface DeleteDocumentJob {
  documentId: string;
  fileUrl: string;
}

@Processor('documents')
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  // Environment variables needed
  private readonly openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
  private readonly openRouterUrl = 'https://openrouter.ai/api/v1/embeddings';
  private readonly mongoUri = process.env.MONGODB_URI || '';

  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @Inject(S3_PROVIDER) private readonly s3Client: S3Client,
  ) {
    super();
  }

  // Connect lazily to MongoDB inside the worker
  private async getMongoDb(): Promise<Db> {
    if (this.mongoDb) return this.mongoDb;
    if (!this.mongoUri)
      throw new Error('MONGODB_URI is not set in environment');

    this.mongoClient = new MongoClient(this.mongoUri);
    await this.mongoClient.connect();

    // Default to 'crag' or fetch db name from URI
    this.mongoDb = this.mongoClient.db();
    return this.mongoDb;
  }

  async process(
    job: Job<ProcessDocumentJob | DeleteDocumentJob>,
  ): Promise<void> {
    if (job.name === 'process-document') {
      return this.handleProcessDocument(job as Job<ProcessDocumentJob>);
    }
  }

  async handleDeleteDocument(job: Job<DeleteDocumentJob>) {
    const { documentId, fileUrl } = job.data;
    this.logger.log(
      `[Job ${job.id}] Starting clean deletion for document: ${documentId}`,
    );
    try {
      await this.deleteFromS3(fileUrl);
      this.logger.log(`[Job ${job.id}] S3 file deleted: ${fileUrl}`);

      const db = await this.getMongoDb();
      const collection = db.collection('document_embeddings');
      const deleteResult = await collection.deleteMany({ documentId });
      this.logger.log(
        `[Job ${job.id}] Deleted ${deleteResult.deletedCount} vector chunks from MongoDB`,
      );

      await this.documentRepo.delete(documentId);
      this.logger.log(
        `[Job ${job.id}] Postgres record deleted for document: ${documentId}. Cleanup complete.`,
      );
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Failed to delete document ${documentId}`,
        error.stack,
      );
      throw error;
    }
  }

  async handleProcessDocument(job: Job<ProcessDocumentJob>): Promise<void> {
    const { documentId, fileUrl, orgId, uploadedBy, embeddingModel } = job.data;
    this.logger.log(
      `[Job ${job.id}] Starting processing for document: ${documentId}`,
    );

    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc) {
      this.logger.warn(`[Job ${job.id}] Document not found: ${documentId}`);
      return;
    }

    try {
      await this.documentRepo.update(documentId, {
        status: DocumentStatus.PROCESSING,
      });

      const buffer = await this.downloadFromS3(fileUrl);
      const rawText = await this.extractText(buffer, fileUrl);
      const chunks = this.chunkText(rawText, 1000, 200);
      this.logger.log(
        `[Job ${job.id}] Extracted ${chunks.length} chunks from document`,
      );
      const documentName = this.extractDocumentNameFromS3Url(fileUrl);
      const db = await this.getMongoDb();
      const collection = db.collection('document_embeddings');
      for (let i = 0; i < chunks.length; i++) {
        const textChunk = chunks[i];
        const vector = await this.createEmbedding(textChunk, embeddingModel);
        await collection.insertOne({
          documentId,
          documentName,
          orgId,
          uploadedBy,
          chunkIndex: i,
          text: textChunk,
          embedding: vector,
          model: embeddingModel,
          createdAt: new Date(),
        });
      }

      await this.documentRepo.update(documentId, {
        status: DocumentStatus.READY,
      });
      this.logger.log(`[Job ${job.id}] Document ${documentId} → READY`);
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Failed to process document ${documentId}`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.documentRepo.update(documentId, {
        status: DocumentStatus.FAILED,
      });

      throw error;
    }
  }

  // Helper Methods

  private async downloadFromS3(s3Url: string): Promise<Buffer> {
    const cleaned = s3Url.replace(/^s3:\/\//, '');
    const [bucket, ...rest] = cleaned.split('/');
    const key = rest.join('/');

    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.s3Client.send(cmd);

    if (!response.Body) throw new Error('S3 Object Body is empty');

    // @ts-ignore: Converting Node.js Readable stream to buffer
    const chunks = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private async extractText(buffer: Buffer, fileUrl: string): Promise<string> {
    const ext = fileUrl.split('.').pop()?.toLowerCase() || '';

    if (ext === 'pdf') {
      const data = new PDFParse({ data: new Uint8Array(buffer) });
      return (await data.getText()).text;
    } else if (['txt', 'md', 'csv', 'json'].includes(ext)) {
      return buffer.toString();
    }

    throw new Error(`Unsupported file extension for text extraction: .${ext}`);
  }

  private chunkText(
    text: string,
    maxChunkLength: number = 1000,
    overlap: number = 200,
  ): string[] {
    // Split by double newlines (paragraphs) as a first pass
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      // If adding this paragraph exceeds our limit, push the current chunk and start a new one
      if (
        currentChunk.length + paragraph.length > maxChunkLength &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());

        // Start the new chunk with the overlap from the end of the previous chunk
        const overlapText = currentChunk.slice(-overlap);
        // Try to start the overlap cleanly at a space
        const cleanOverlap = overlapText.substring(
          overlapText.indexOf(' ') + 1,
        );
        currentChunk = cleanOverlap + '\n\n' + paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async deleteFromS3(s3Url: string): Promise<void> {
    const cleaned = s3Url.replace(/^s3:\/\//, '');
    const [bucket, ...rest] = cleaned.split('/');
    const key = rest.join('/');

    if (!bucket || !key) return;

    const cmd = new DeleteObjectCommand({ Bucket: bucket, Key: key });
    await this.s3Client.send(cmd);
  }
  private extractDocumentNameFromS3Url(s3Url: string): string {
    const cleaned = s3Url.replace(/^s3:\/\//, '');
    const parts = cleaned.split('/');
    const last = parts[parts.length - 1] || 'Unknown Document';
    const withoutPrefix = last.replace(/^\d+_/, '');
    return decodeURIComponent(withoutPrefix);
  }

  private async createEmbedding(
    input: string,
    model: string,
  ): Promise<number[]> {
    if (!this.openRouterApiKey) {
      throw new Error('Missing OPENROUTER_API_KEY environment variable');
    }

    const response = await axios.post(
      this.openRouterUrl,
      { model, input },
      {
        headers: {
          Authorization: `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'crag-backend',
        },
        timeout: 30000,
      },
    );

    const vector = response?.data?.data?.[0]?.embedding;
    if (!Array.isArray(vector)) {
      throw new Error('Invalid embedding response from OpenRouter');
    }

    return vector as number[];
  }
}
