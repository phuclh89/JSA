import { ValidationError } from '../errors/application-errors';

export function assertOracleId(value: string, field = 'id'): string {
  if (!/^\d{1,19}$/.test(value)) throw new ValidationError(`${field} must be a decimal ID string`);
  return value;
}
