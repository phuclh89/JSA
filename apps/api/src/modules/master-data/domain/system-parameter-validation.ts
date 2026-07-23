import { ValidationError } from '../../../common/errors/application-errors';

export function validateSystemParameter(key: string, type: unknown, value: unknown): void {
  if (/(PASSWORD|SECRET|TOKEN|PRIVATE.?KEY|CONNECTION.?STRING|CREDENTIAL)/i.test(key))
    throw new ValidationError('Secrets are not permitted in System Parameters');
  if (typeof type !== 'string' || typeof value !== 'string')
    throw new ValidationError('System Parameter valueType and value are required');
  let valid = false;
  if (type === 'STRING') valid = true;
  else if (type === 'INTEGER') valid = /^-?\d+$/.test(value);
  else if (type === 'DECIMAL') valid = /^-?\d+(\.\d+)?$/.test(value);
  else if (type === 'BOOLEAN') valid = /^(true|false)$/i.test(value);
  else if (type === 'DATE') valid = !Number.isNaN(Date.parse(value));
  else if (type === 'JSON') {
    try {
      JSON.parse(value);
      valid = true;
    } catch {
      valid = false;
    }
  }
  if (!valid) throw new ValidationError(`Value is invalid for declared type ${type}`);
}
