import { registerAs } from '@nestjs/config';

export type AppConfig = {
  port: number;
  bcryptRounds: number;
  databaseUrl: string;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  github: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
};

export default registerAs('app', (): AppConfig => {
  const required = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} environment variable is required`);
    return v;
  };

  return {
    port: Number(process.env.PORT ?? 3000),
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
    databaseUrl: required('DATABASE_URL'),
    jwt: {
      secret: required('JWT_SECRET'),
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      refreshSecret: required('JWT_REFRESH_SECRET'),
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? '',
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      callbackUrl: process.env.GITHUB_CALLBACK_URL ?? '',
    },
  };
});
