import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrganizationDto } from 'src/organization/dto/create-organization.dto';

export class RegisterOrgDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @ValidateNested()
  @Type(() => RegisterOrgDto)
  @IsNotEmpty()
  org: CreateOrganizationDto;
}
