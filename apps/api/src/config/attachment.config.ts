import { registerAs } from '@nestjs/config';

export default registerAs('attachment', () => ({
  storageRoot: process.env.ATTACHMENT_STORAGE_ROOT,
  maxFileSizeBytes: Number(process.env.ATTACHMENT_MAX_FILE_SIZE_BYTES ?? 52_428_800),
}));
