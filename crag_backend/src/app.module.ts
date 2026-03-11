import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig, { AppConfig } from 'config/env';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { OrganizationModule } from './organization/organization.module';
import { UsersModule } from './users/users.module';
import { MembershipModule } from './membership/membership.module';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
