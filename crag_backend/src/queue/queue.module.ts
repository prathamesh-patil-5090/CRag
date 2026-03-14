import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from 'config/env';
import { Document } from 'src/documents/entities/document.entity';
import { DocumentProcessor } from 'src/workers/document.processor';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.get<AppConfig>('app')!;
        return {
          connection: {
            url: cfg.redisUrl,
          },
          defaultJobOptions: {
            removeOnComplete: true,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: 'documents',
    }),
    TypeOrmModule.forFeature([Document]),
  ],
  providers: [DocumentProcessor],
  exports: [BullModule],
})
export class QueueModule {}
