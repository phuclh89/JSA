import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../common/errors/application-errors';

@Injectable()
export class FilesystemAttachmentStorage {
  constructor(private readonly config: ConfigService) {}

  createKey(scope: { siteId: string; rigId: string; departmentId: string }, fileName: string) {
    const safeName = path
      .basename(fileName)
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(-180);
    return `${scope.siteId}/${scope.rigId}/${scope.departmentId}/${randomUUID()}-${safeName}`;
  }

  async put(storageKey: string, bytes: Buffer): Promise<void> {
    const target = this.resolve(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.resolve(storageKey), { force: true });
  }

  open(storageKey: string): ReadStream {
    return createReadStream(this.resolve(storageKey));
  }

  private resolve(storageKey: string): string {
    const rootValue = this.config.get<string>('attachment.storageRoot');
    if (!rootValue)
      throw new ValidationError('Attachment storage is not configured on this server');
    const root = path.resolve(rootValue);
    const target = path.resolve(root, ...storageKey.split('/'));
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new ValidationError('Attachment storage key is invalid');
    return target;
  }
}
