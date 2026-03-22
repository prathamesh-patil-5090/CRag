import { Injectable } from '@nestjs/common';
import { paginate, Paginated, PaginateQuery } from 'nestjs-paginate';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthProvider, User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  create(dto: CreateUserDto): Promise<User> {
    const user = this.repo.create(dto);
    return this.repo.save(user);
  }

  findAll(query: PaginateQuery): Promise<Paginated<User>> {
    return paginate(query, this.repo, {
      sortableColumns: ['id', 'username', 'email', 'createdAt'],
      defaultSortBy: [['createdAt', 'DESC']],
    });
  }

  findOne(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByIdentifier(identifier: string): Promise<User | null> {
    const idNorm = identifier.trim().toLowerCase();
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :idNorm OR LOWER(user.username) = :idNorm', {
        idNorm,
      })
      .orderBy(`(LOWER(user.email) = :idNorm)`, 'DESC')
      .setParameter('idNorm', idNorm)
      .getOne();
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.username) = :username', { username })
      .getOne();
  }
  findByEmail(email: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
  }

  findByProviderId(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    return this.repo.findOne({ where: { provider, providerId } });
  }

  findByIdWithRefreshToken(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('user')
      .addSelect('user.hashedRefreshToken')
      .where('user.id = :id', { id })
      .getOne();
  }

  async updateRefreshToken(id: string, token: string | null): Promise<void> {
    await this.repo.query(
      `UPDATE "users" SET "hashedRefreshToken" = $1 WHERE "id" = $2`,
      [token, id],
    );
  }

  async update(id: string, dto: UpdateUserDto): Promise<User | null> {
    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
