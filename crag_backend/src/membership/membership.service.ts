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
import {
  Memberships,
  OrgRole,
} from 'src/membership/entities/membership.entity';
import { Organization } from 'src/organization/entities/organization.entity';
import { User } from 'src/users/entities/user.entity';
import { Repository } from 'typeorm';

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

  findOne(id: string) {
    return this.repo.findOne({
      where: {
        id,
      },
    });
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
    const roleEnum = roleNorm as OrgRole;
    if (roleEnum === OrgRole.OWNER) {
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

  async transferOwnershipToUser(
    ownerUserId: string,
    targetUserId: string,
    orgId: string,
  ) {
    if (ownerUserId === targetUserId) {
      throw new BadRequestException('Owner and target user are the same');
    }

    const ownerMembership = await this.repo.findOne({
      where: { user: { id: ownerUserId }, organization: { orgId } },
      relations: ['user', 'organization'],
    });
    if (!ownerMembership || ownerMembership.role !== OrgRole.OWNER) {
      throw new BadRequestException(
        'Current user is not the owner of this organization',
      );
    }

    const targetMembership = await this.repo.findOne({
      where: { user: { id: targetUserId }, organization: { orgId } },
      relations: ['user', 'organization'],
    });

    if (!targetMembership) {
      throw new NotFoundException(
        'Target user is not a member of the organization',
      );
    }

    if (targetMembership.role === OrgRole.OWNER) {
      throw new BadRequestException('Target user is already the owner');
    }

    const [updatedTarget, updatedOwner] = await this.repo.manager.transaction(
      async (manager) => {
        ownerMembership.role = OrgRole.ADMIN;
        const savedOwner = await manager.save(Memberships, ownerMembership);
        targetMembership.role = OrgRole.OWNER;
        const savedTarget = await manager.save(Memberships, targetMembership);
        return [savedTarget, savedOwner];
      },
    );

    return {
      message: 'Ownership transferred',
      orgId,
      previousOwner: {
        userId: ownerUserId,
        membershipId: ownerMembership.id,
        role: updatedOwner.role,
      },
      newOwner: {
        userId: targetUserId,
        membershipId: targetMembership.id,
        role: updatedTarget.role,
      },
      updatedTarget,
      updatedOwner,
    };
  }
  async updateMembershipToUser(
    id: string,
    userId: string,
    role: string,
    orgId: string,
  ) {
    if (!role) throw new BadRequestException('Role is required');
    const roleNorm = role.trim().toUpperCase();
    if (!Object.values(OrgRole).includes(roleNorm as OrgRole)) {
      throw new BadRequestException('Invalid role');
    }
    if ((roleNorm as OrgRole) === OrgRole.OWNER) {
      throw new BadRequestException(
        'Cannot update role to OWNER role via this method',
      );
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

    await this.repo.update(id, {
      user,
      organization: org,
      role: roleNorm as OrgRole,
    });

    return this.findOne(id);
  }

  remove(orgId: string) {
    return this.repo.delete(orgId);
  }
}
