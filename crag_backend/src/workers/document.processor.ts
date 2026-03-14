import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import {
  Document,
  DocumentStatus,
} from 'src/documents/entities/document.entity';
import { Repository } from 'typeorm';

@Processor('documents')
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
  ) {
    super();
  }

  async process(job: Job<{ documentId: string }>): Promise<void> {
    const { documentId } = job.data;

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
      this.logger.log(`[Job ${job.id}] Document ${documentId} → PROCESSING`);

      await new Promise<void>((resolve) => setTimeout(resolve, 3000));

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
}
