import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { User } from 'src/users/entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from './decorator/roles.decorator';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { OrgRole } from './entities/membership.entity';
import { OrgRoleGuard } from './guards/org-roles.guard';
import { MembershipService } from './membership.service';

@UseGuards(JwtAuthGuard, OrgRoleGuard)
@Controller('membership')
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @Roles(OrgRole.ADMIN, OrgRole.OWNER)
  @Post()
  create(@Body() createMembershipDto: CreateMembershipDto) {
    return this.membershipService.assignMembershipToUser(
      createMembershipDto.userId,
      createMembershipDto.role,
      createMembershipDto.orgId,
    );
  }

  @Roles(OrgRole.OWNER)
  @Post('transfer-ownership')
  transferOwnership(
    @Request() req: ExpressRequest & { user?: User },
    @Body('targetUserId') targetUserId: string,
    @Body('orgId') orgId: string,
  ) {
    const currentUserId = req.user?.id;

    if (!currentUserId) throw new UnauthorizedException('Need a valid user Id');

    return this.membershipService.transferOwnershipToUser(
      currentUserId,
      targetUserId,
      orgId,
    );
  }

  @Get()
  findAll() {
    return this.membershipService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.membershipService.findOne(id);
  }

  @Roles(OrgRole.ADMIN, OrgRole.OWNER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMembershipDto: UpdateMembershipDto,
  ) {
    return this.membershipService.updateMembershipToUser(
      id,
      updateMembershipDto.userId as string,
      updateMembershipDto.role as OrgRole,
      updateMembershipDto.orgId as string,
    );
  }

  @Roles(OrgRole.ADMIN, OrgRole.OWNER)
  @Delete(':orgId') // Changed :id to :orgId so the guard can find it
  remove(@Param('orgId') orgId: string) {
    return this.membershipService.remove(orgId);
  }
}
