import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig, { AppConfig } from 'config/env';
import { updateGlobalConfig } from 'nestjs-paginate';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { s3Provider } from './common/s3.provider';
import { DocumentsModule } from './documents/documents.module';
import { MembershipModule } from './membership/membership.module';
import { OrganizationModule } from './organization/organization.module';
import { QueueModule } from './queue/queue.module';
import { UsersModule } from './users/users.module';

updateGlobalConfig({
  defaultOrigin: undefined,
  defaultLimit: 5,
  defaultMaxLimit: 100,
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.get<AppConfig>('app')!;
        return {
          type: 'postgres',
          url: cfg.databaseUrl,
          autoLoadEntities: true,
          synchronize: true,
          ssl: { rejectUnauthorized: false },
        };
      },
    }),
    AuthModule,
    UsersModule,
    OrganizationModule,
    MembershipModule,
    QueueModule,
    DocumentsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, s3Provider],
})
export class AppModule {}
