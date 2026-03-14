import { S3Client } from '@aws-sdk/client-s3';
import * as process from 'process';

export const s3Client = new S3Client({
  region: process.env.MINIO_REGION ?? 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'admin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'password123',
  },
  forcePathStyle: process.env.MINIO_FORCE_PATH_STYLE === 'true' || true,
});
