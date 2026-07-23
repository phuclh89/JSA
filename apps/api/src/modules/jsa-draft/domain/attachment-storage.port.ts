export const ATTACHMENT_STORAGE = Symbol('ATTACHMENT_STORAGE');
export interface AttachmentStoragePort {
  put(input: { key:string; contentType:string; bytes:Uint8Array }): Promise<void>;
  remove(key:string): Promise<void>;
}
