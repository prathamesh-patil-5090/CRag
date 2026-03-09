import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from 'config/env';
import type { StringValue } from 'ms';
import { Memberships } from 'src/users/entities/membership.entity';
import { User } from 'src/users/entities/user.entity';
import { Organization } from './entities/organization.entity';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { MembershipService } from './membership.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { LocalOrgStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([Organization, Memberships, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cfg = configService.get<AppConfig>('app')!;
        return {
          secret: cfg.jwt.secret,
          signOptions: { expiresIn: cfg.jwt.expiresIn as StringValue },
        };
      },
    }),
  ],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    MembershipService,
    LocalAuthGuard,
    LocalOrgStrategy,
  ],
  exports: [OrganizationService, MembershipService],
})
export class OrganizationModule {}
