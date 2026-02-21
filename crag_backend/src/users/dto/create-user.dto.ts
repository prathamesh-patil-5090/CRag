import { AuthProvider } from '../entities/user.entity';

export class CreateUserDto {
  email: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  password?: string;
  provider?: AuthProvider;
  providerId?: string;
}
