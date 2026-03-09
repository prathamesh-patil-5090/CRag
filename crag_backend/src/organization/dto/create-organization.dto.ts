import { IsEmpty, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  orgName: string;

  @IsString()
  @IsNotEmpty()
  orgMail: string;

  @IsString()
  @MinLength(8)
  password: string;
}
