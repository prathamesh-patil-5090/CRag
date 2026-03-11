import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from 'config/env';
import type { StringValue } from 'ms';
import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/users/entities/user.entity';
import { Memberships } from './entities/membership.entity';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

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
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
