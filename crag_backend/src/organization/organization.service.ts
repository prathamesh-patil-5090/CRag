import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization } from './entities/organization.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Organization)
    private readonly repo: Repository<Organization>,
  ) {}

  create(createOrganizationDto: CreateOrganizationDto) {
    const org = this.repo.create(createOrganizationDto);
    return this.repo.save(org);
  }

  findAll() {
    return this.repo.find();
  }


  findOne(id: string) {
    return this.repo.findOneBy({ orgId: id });
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto) {
    await this.repo.update(id, updateOrganizationDto);
    return this.findOne(id);
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}
