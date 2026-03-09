import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { AppConfig } from 'config/env';
import { Memberships, OrgRole } from 'src/users/entities/membership.entity';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(Memberships)
    private readonly repo: Repository<Memberships>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private cfg(): AppConfig {
    return this.configService.get<AppConfig>('app')!;
  }

  findAll() {
    return this.repo.find();
  }

  findByOrgId(orgId: string) {
    return this.repo.find({
      where: {
        organization: { orgId },
      },
      relations: ['user', 'organization'],
    });
  }

  findByUserIdAndOrgId(userId: string, orgId: string) {
    return this.repo.findOne({
      where: {
        user: { id: userId },
        organization: { orgId },
      },
    });
  }

  findByUserId(userId: string) {
    return this.repo.find({
      where: {
        user: { id: userId },
      },
      relations: ['user', 'organization'],
    });
  }

  async assignMembershipToUser(userId: string, role: string, orgId: string) {
    if (!role) throw new BadRequestException('Role is required');
    const roleNorm = role.trim().toUpperCase();
    if (!Object.values(OrgRole).includes(roleNorm as OrgRole)) {
      throw new BadRequestException('Invalid role');
    }
    if (roleNorm === OrgRole.OWNER) {
      throw new BadRequestException('Cannot assign OWNER role via this method');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const org = await this.orgRepo.findOne({ where: { orgId } });
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.findByUserIdAndOrgId(userId, orgId);
    if (existing)
      throw new ConflictException(
        'User is already a member of this organization',
      );

    const membership = this.repo.create({
      user,
      organization: org,
      role: roleNorm as OrgRole,
    });

    return this.repo.save(membership);
  }
}
