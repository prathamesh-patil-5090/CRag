import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthProvider } from '../entities/user.entity';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEnum(AuthProvider)
  @IsOptional()
  provider?: AuthProvider;

  @IsString()
  @IsOptional()
  providerId?: string;
}
