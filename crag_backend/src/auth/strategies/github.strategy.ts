import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AppConfig } from 'config/env';
import { Strategy } from 'passport-github2';
import { AuthService, OAuthProfile } from '../auth.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    const cfg = configService.get<AppConfig>('app')!;
    super({
      clientID: cfg.github.clientId,
      clientSecret: cfg.github.clientSecret,
      callbackURL: cfg.github.callbackUrl,
      scope: ['user:email'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: OAuthProfile,
    done: (err: Error | null, user: unknown) => void,
  ): Promise<void> {
    const user = await this.authService.validateOAuthUser(profile, 'github');
    done(null, user);
  }
}
