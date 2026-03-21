import 'dotenv/config';
import { AnyBulkWriteOperation, MongoClient, ObjectId } from 'mongodb';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Document } from '../src/documents/entities/document.entity';

function extractDocumentNameFromS3Url(s3Url: string): string {
  const cleaned = s3Url.replace(/^s3:\/\//, '');
  const parts = cleaned.split('/');
  const last = parts[parts.length - 1] || 'Unknown Document';
  const withoutPrefix = last.replace(/^\d+_/, '');
  return decodeURIComponent(withoutPrefix);
}

type EmbeddingRow = {
  _id: ObjectId;
  documentId?: string;
};

const BATCH_SIZE = 1000;

async function main() {
  const postgresUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const mongoUri = process.env.MONGODB_URI;

  if (!postgresUrl) throw new Error('Missing DATABASE_URL or SUPABASE_DB_URL');
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const pg = new DataSource({
    type: 'postgres',
    url: postgresUrl,
    entities: [Document],
    synchronize: false,
  });

  await pg.initialize();
  const docRepo = pg.getRepository(Document);

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db();
  const embeddings = db.collection('document_embeddings');

  const cursor = embeddings.find(
    {
      $or: [{ documentName: { $exists: false } }, { documentName: '' }],
    },
    {
      projection: { _id: 1, documentId: 1 },
      batchSize: BATCH_SIZE,
    },
  );

  let scanned = 0;
  let updated = 0;
  let unresolved = 0;

  // cache: documentId -> documentName (or null when not found)
  const nameCache = new Map<string, string | null>();

  // pending mongo write ops
  let ops: AnyBulkWriteOperation<EmbeddingRow>[] = [];

  // flush function
  const flush = async () => {
    if (ops.length === 0) return;
    const res = await embeddings.bulkWrite(ops as any, { ordered: false });
    updated += res.modifiedCount ?? 0;
    ops = [];
  };

  while (await cursor.hasNext()) {
    const row = (await cursor.next()) as EmbeddingRow | null;
    if (!row) continue;
    scanned++;

    const documentId = String(row.documentId || '');
    if (!documentId) {
      unresolved++;
      continue;
    }

    let documentName = nameCache.get(documentId);
    if (documentName === undefined) {
      const doc = await docRepo.findOne({
        where: { id: documentId },
        select: { id: true, fileUrl: true } as any,
      });

      if (!doc?.fileUrl) {
        nameCache.set(documentId, null);
        unresolved++;
        continue;
      }

      documentName = extractDocumentNameFromS3Url(doc.fileUrl);
      nameCache.set(documentId, documentName);
    }

    if (!documentName) {
      unresolved++;
      continue;
    }

    ops.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: { documentName } },
      },
    });

    if (ops.length >= BATCH_SIZE) {
      await flush();
      console.log(
        `Progress -> scanned: ${scanned}, updated: ${updated}, unresolved: ${unresolved}`,
      );
    }
  }

  // final flush
  await flush();

  console.log(
    `Backfill complete -> scanned: ${scanned}, updated: ${updated}, unresolved: ${unresolved}`,
  );

  await cursor.close();
  await mongo.close();
  await pg.destroy();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
