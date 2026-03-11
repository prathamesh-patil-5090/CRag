import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { OrgRole } from '../entities/membership.entity';

export class CreateMembershipDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsUUID()
  @IsNotEmpty()
  orgId: string;

  @IsEnum(OrgRole)
  @IsNotEmpty()
  role: OrgRole;
}
