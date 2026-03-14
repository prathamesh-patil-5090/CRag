import { Provider } from '@nestjs/common';
import { s3Client } from './s3.client';
export const S3_PROVIDER = 'S3_CLIENT';
export const s3Provider: Provider = {
  provide: S3_PROVIDER,
  useValue: s3Client,
};
