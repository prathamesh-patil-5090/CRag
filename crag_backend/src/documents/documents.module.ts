import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipModule } from 'src/membership/membership.module';
import { QueueModule } from 'src/queue/queue.module';
import { s3Provider } from 'src/common/s3.provider';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document } from './entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    MembershipModule,
    QueueModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, s3Provider],
})
export class DocumentsModule {}
