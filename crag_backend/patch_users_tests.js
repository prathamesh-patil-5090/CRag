const fs = require('fs');

// Patch organization.controller.ts (fix the import error)
const orgControllerPath = 'src/organization/organization.controller.ts';
let orgControllerCode = fs.readFileSync(orgControllerPath, 'utf8');
orgControllerCode = orgControllerCode.replace(
  "import { Paginate, PaginateQuery } from 'nestjs-paginate';",
  "import { Paginate } from 'nestjs-paginate';\nimport type { PaginateQuery } from 'nestjs-paginate';"
);
fs.writeFileSync(orgControllerPath, orgControllerCode);

// Patch users.controller.ts (fix return type mismatch)
const usersControllerPath = 'src/users/users.controller.ts';
let usersControllerCode = fs.readFileSync(usersControllerPath, 'utf8');

const usersControllerTarget = `  @Get()
  findAll(@Paginate() query: PaginateQuery): Promise<User[]> {
    return this.usersService.findAll(query);
  }`;
// If that doesn't exist, let's just do a broad replace on the method:
usersControllerCode = usersControllerCode.replace(
  /findAll\(\)\: Promise<User\[\]> \{\s*return this\.usersService\.findAll\(\);\s*\}/g,
  `findAll(@Paginate() query: PaginateQuery): Promise<Paginated<User>> {
    return this.usersService.findAll(query);
  }`
);
// Make sure it doesn't have double imports
if(!usersControllerCode.includes("import type { PaginateQuery }")) {
   usersControllerCode = usersControllerCode.replace(
     "import { Paginate, Paginated, PaginateQuery } from 'nestjs-paginate';",
     "import { Paginate, Paginated } from 'nestjs-paginate';\nimport type { PaginateQuery } from 'nestjs-paginate';"
   );
}
fs.writeFileSync(usersControllerPath, usersControllerCode);

console.log('Fixed typings.');
