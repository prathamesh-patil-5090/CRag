const fs = require('fs');

const controllerPath = 'src/organization/organization.controller.ts';
let code = fs.readFileSync(controllerPath, 'utf8');

if (!code.includes('JwtAuthGuard')) {
  code = code.replace(
    "import { LocalAuthGuard } from './guards/local-auth.guard';",
    "import { LocalAuthGuard } from './guards/local-auth.guard';\nimport { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';"
  );
}

const findTarget = `  @Get()
  findAll(@Paginate() query: PaginateQuery) {`;
const findReplacement = `  @UseGuards(JwtAuthGuard)\n  @Get()\n  findAll(@Paginate() query: PaginateQuery) {`;
code = code.replace(findTarget, findReplacement);

const findOneTarget = `  @Get(':id')
  findOne(@Param('id') id: string) {`;
const findOneReplacement = `  @UseGuards(JwtAuthGuard)\n  @Get(':id')\n  findOne(@Param('id') id: string) {`;
code = code.replace(findOneTarget, findOneReplacement);

const updateTarget = `  @Patch(':id')
  update(`;
const updateReplacement = `  @UseGuards(JwtAuthGuard)\n  @Patch(':id')\n  update(`;
code = code.replace(updateTarget, updateReplacement);

const deleteTarget = `  @Delete(':id')
  remove(@Param('id') id: string) {`;
const deleteReplacement = `  @UseGuards(JwtAuthGuard)\n  @Delete(':id')\n  remove(@Param('id') id: string) {`;
code = code.replace(deleteTarget, deleteReplacement);

fs.writeFileSync(controllerPath, code);

console.log('Secured org controller with JwtAuthGuard.');
