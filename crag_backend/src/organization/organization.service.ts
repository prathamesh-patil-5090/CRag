import { ConflictException, Injectable } from '@nestjs/common';
import { paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { AppConfig } from 'config/env';
import type { StringValue } from 'ms';
import { AuthTokens } from 'src/auth/auth.service';
import { Repository } from 'typeorm';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationLogin } from './dto/login-org.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly repo: Repository<Organization>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private cfg(): AppConfig {
    return this.configService.get<AppConfig>('app')!;
  }

  async create(createOrganizationDto: CreateOrganizationDto) {
    const existing = await this.repo.findOneBy({
      orgMail: createOrganizationDto.orgMail,
    });
    if (existing)
      throw new ConflictException('This Organization Email is already in use');

    const existingName = await this.repo.findOneBy({
      orgName: createOrganizationDto.orgName,
    });
    if (existingName)
      throw new ConflictException('This Organization Name is already in use');

    const hashed = await bcrypt.hash(
      createOrganizationDto.password,
      this.cfg().bcryptRounds,
    );
    const org = this.repo.create({
      orgMail: createOrganizationDto.orgMail,
      orgName: createOrganizationDto.orgName,
      password: hashed,
    });

    await this.repo.save(org);
    const result = {
      orgId: org.orgId,
      orgName: org.orgName,
      orgMail: org.orgMail,
    };
    return result;
  }

  async issueTokens(org: OrganizationLogin) {
    const payload = {
      orgId: org.orgId,
      orgEmail: org.orgMail,
      orgName: org.orgName,
    };

    const access_token: string = this.jwtService.sign(payload);

    const refresh_token: string = this.jwtService.sign(payload, {
      secret: this.cfg().jwt.refreshSecret,
      expiresIn: this.cfg().jwt.refreshExpiresIn as StringValue,
    });

    const hashed = await bcrypt.hash(refresh_token, this.cfg().bcryptRounds);
    await this.updateRefreshToken(org.orgId, hashed);

    return { access_token, refresh_token } as AuthTokens;
  }

  async updateRefreshToken(id: string, token: string | null): Promise<void> {
    await this.repo.query(
      `UPDATE "org" SET "hashedRefreshToken" = $1 WHERE "orgId" = $2`,
      [token, id],
    );
  }

  findAll(query: PaginateQuery): Promise<Paginated<Organization>> {
    return paginate(query, this.repo, {
      sortableColumns: ['orgName', 'orgMail'],
      defaultSortBy: [['orgName', 'ASC']],
    });
  }

  findOne(id: string) {
    return this.repo.findOneBy({ orgId: id });
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    const existingName = await this.repo.findOneBy({
      orgName: updateOrganizationDto.orgName,
    });
    if (existingName)
      throw new ConflictException('This Organization Name is already in use');
    await this.repo.update(id, updateOrganizationDto);
    return this.findOne(id);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }

  findByOrgIdentifier(identifier: string): Promise<Organization | null> {
    const idNorm = identifier.trim().toLowerCase();
    return this.repo
      .createQueryBuilder('org')
      .addSelect('org.password')
      .where('LOWER(org.orgMail) = :idNorm', {
        idNorm,
      })
      .orderBy(`(LOWER(org.orgMail) = :idNorm)`, 'DESC')
      .setParameter('idNorm', idNorm)
      .getOne();
  }
}
