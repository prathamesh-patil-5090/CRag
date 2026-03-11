import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AppConfig } from 'config/env';
import type { StringValue } from 'ms';
import { MembershipService } from 'src/membership/membership.service';
import { OrganizationService } from 'src/organization/organization.service';
import { AuthProvider, User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

export interface OAuthProfile {
  id: string | number;
  displayName?: string;
  username?: string;
  emails?: Array<{ value: string }>;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly orgService: OrganizationService,
    private readonly memService: MembershipService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private cfg(): AppConfig {
    return this.configService.get<AppConfig>('app')!;
  }

  async issueTokens(user: Partial<User>) {
    const payload = {
      sub: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
    };

    const access_token: string = this.jwtService.sign(payload);

    const refresh_token: string = this.jwtService.sign(payload, {
      secret: this.cfg().jwt.refreshSecret,
      expiresIn: this.cfg().jwt.refreshExpiresIn as StringValue,
    });

    const hashed = await bcrypt.hash(refresh_token, this.cfg().bcryptRounds);
    await this.usersService.updateRefreshToken(user.id!, hashed);

    return { access_token, refresh_token } as AuthTokens;
  }

  async validateUser(
    identifier: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const id = identifier.trim();

    const user = await this.usersService.findByIdentifier(id);
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid Credentials');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid Credentials');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) throw new ConflictException('Email already in use');

    const existingUsername = await this.usersService.findByUsername(
      dto.username,
    );
    if (existingUsername)
      throw new ConflictException('Username already in use');

    const doesOrgExist = await this.orgService.findOne(dto.org.orgId);
    if (!doesOrgExist)
      throw new ConflictException('Organization does not exists');

    const hashed = await bcrypt.hash(dto.password, this.cfg().bcryptRounds);
    const user = await this.usersService.create({
      email: dto.email,
      username: dto.username,
      password: hashed,
      provider: AuthProvider.LOCAL,
    });

    await this.memService.assignMembershipToUser(
      user.id,
      'MEMBER',
      dto.org.orgId,
    );

    return this.issueTokens(user);
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const user = await this.usersService.findByIdWithRefreshToken(userId);
    if (!user?.hashedRefreshToken)
      throw new UnauthorizedException('Access denied');

    const tokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashedRefreshToken,
    );
    if (!tokenMatches) throw new UnauthorizedException('Access denied');

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.updateRefreshToken(userId, null);
    return { message: 'Logged out successfully' };
  }

  async validateOAuthUser(
    profile: OAuthProfile,
    providerName: string,
  ): Promise<User> {
    const provider = providerName as AuthProvider;
    const providerId = String(profile.id);

    let user = await this.usersService.findByProviderId(provider, providerId);
    if (user) {
      console.log(profile);
      return user;
    }

    const firstName: string =
      profile.displayName?.split(' ')[0] ?? profile.username ?? '';
    const lastName: string = profile.displayName?.split(' ')[1] ?? '';
    const email: string =
      profile.emails?.[0]?.value ?? `${providerId}@${provider}.oauth`;
    const username: string =
      profile.emails?.[0].value.split('@')[0] ??
      profile.username ??
      email.split('@')[0];

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      return (await this.usersService.update(existing.id, {
        provider,
        providerId,
      })) as User;
    }

    user = await this.usersService.create({
      firstName,
      lastName,
      email,
      username,
      provider,
      providerId,
    });
    return user;
  }
}
