const fs = require('fs');

// 1. Patch organization.service.ts
const orgServicePath = 'src/organization/organization.service.ts';
let orgServiceCode = fs.readFileSync(orgServicePath, 'utf8');

const orgServiceTarget = `  findAll() {
    return this.repo.find();
  }`;

const orgServiceReplacement = `  findAll(query: PaginateQuery): Promise<Paginated<Organization>> {
    return paginate(query, this.repo, {
      sortableColumns: ['orgName', 'orgMail'],
      defaultSortBy: [['orgName', 'ASC']],
    });
  }`;

orgServiceCode = orgServiceCode.replace(orgServiceTarget, orgServiceReplacement);
if (!orgServiceCode.includes('import { paginate')) {
  orgServiceCode = orgServiceCode.replace(
    "import { ConflictException, Injectable } from '@nestjs/common';",
    "import { ConflictException, Injectable } from '@nestjs/common';\nimport { paginate, Paginated, PaginateQuery } from 'nestjs-paginate';"
  );
}
fs.writeFileSync(orgServicePath, orgServiceCode);

// 2. Patch organization.controller.ts
const orgControllerPath = 'src/organization/organization.controller.ts';
let orgControllerCode = fs.readFileSync(orgControllerPath, 'utf8');

const orgControllerTarget = `  @Get()
  findAll() {
    return this.organizationService.findAll();
  }`;

const orgControllerReplacement = `  @Get()
  findAll(@Paginate() query: PaginateQuery) {
    return this.organizationService.findAll(query);
  }`;

orgControllerCode = orgControllerCode.replace(orgControllerTarget, orgControllerReplacement);
if (!orgControllerCode.includes('import { Paginate')) {
  orgControllerCode = orgControllerCode.replace(
    "import type { Response } from 'express';",
    "import type { Response } from 'express';\nimport { Paginate, PaginateQuery } from 'nestjs-paginate';"
  );
}
fs.writeFileSync(orgControllerPath, orgControllerCode);

// 3. Patch users.service.ts
const usersServicePath = 'src/users/users.service.ts';
let usersServiceCode = fs.readFileSync(usersServicePath, 'utf8');

const usersServiceTarget = `  findAll(): Promise<User[]> {
    return this.repo.find();
  }`;

const usersServiceReplacement = `  findAll(query: PaginateQuery): Promise<Paginated<User>> {
    return paginate(query, this.repo, {
      sortableColumns: ['id', 'username', 'email', 'createdAt'],
      defaultSortBy: [['createdAt', 'DESC']],
    });
  }`;

usersServiceCode = usersServiceCode.replace(usersServiceTarget, usersServiceReplacement);
if (!usersServiceCode.includes('import { paginate')) {
  usersServiceCode = usersServiceCode.replace(
    "import { Injectable } from '@nestjs/common';",
    "import { Injectable } from '@nestjs/common';\nimport { paginate, Paginated, PaginateQuery } from 'nestjs-paginate';"
  );
}
fs.writeFileSync(usersServicePath, usersServiceCode);

// 4. Patch users.controller.ts
const usersControllerPath = 'src/users/users.controller.ts';
let usersControllerCode = fs.readFileSync(usersControllerPath, 'utf8');

const usersControllerTarget = `  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }`;

const usersControllerReplacement = `  @Get()
  findAll(@Paginate() query: PaginateQuery): Promise<Paginated<User>> {
    return this.usersService.findAll(query);
  }`;

usersControllerCode = usersControllerCode.replace(usersControllerTarget, usersControllerReplacement);
if (!usersControllerCode.includes('import { Paginate')) {
  usersControllerCode = usersControllerCode.replace(
    "import { UpdateUserDto } from './dto/update-user.dto';",
    "import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';\nimport { UpdateUserDto } from './dto/update-user.dto';"
  );
}
fs.writeFileSync(usersControllerPath, usersControllerCode);

console.log('Successfully patched Organization and Users pagination.');
