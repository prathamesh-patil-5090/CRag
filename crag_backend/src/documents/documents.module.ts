import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { s3Provider } from 'src/common/s3.provider';
import { Memberships } from 'src/membership/entities/membership.entity';
import { MembershipModule } from 'src/membership/membership.module';
import { Organization } from 'src/organization/entities/organization.entity';
import { OrganizationModule } from 'src/organization/organization.module';
import { QueueModule } from 'src/queue/queue.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document } from './entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, Memberships, Organization]),
    MembershipModule,
    QueueModule,
    OrganizationModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, s3Provider],
})
export class DocumentsModule {}
