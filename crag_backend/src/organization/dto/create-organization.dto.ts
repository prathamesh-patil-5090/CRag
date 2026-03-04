import { IsEmpty, IsNotEmpty, IsString } from 'class-validator';

export class CreateOrganizationDto {
  @IsEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsString()
  @IsNotEmpty()
  orgMail: string;
}
