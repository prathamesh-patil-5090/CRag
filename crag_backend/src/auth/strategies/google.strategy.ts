import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AppConfig } from 'config/env';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService, OAuthProfile } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService,
    private authService: AuthService,
  ) {
    const cfg = configService.get<AppConfig>('app')!;
    super({
      clientID: cfg.google.clientId,
      clientSecret: cfg.google.clientSecret,
      callbackURL: cfg.google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: OAuthProfile,
    done: VerifyCallback,
  ): Promise<void> {
    const user = await this.authService.validateOAuthUser(profile, 'google');
    done(null, user);
  }
}
