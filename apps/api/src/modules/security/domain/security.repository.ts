import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { ApplicationUserRecord, SecurityAssignments } from './security.types';

export const SECURITY_REPOSITORY = Symbol('SECURITY_REPOSITORY');

export interface SecurityRepository {
  findUser(
    context: OracleTransactionContext,
    identityKey: string,
    username: string,
    allowUsernameFallback: boolean,
  ): Promise<ApplicationUserRecord | undefined>;
  loadAssignments(context: OracleTransactionContext, userId: string): Promise<SecurityAssignments>;
}
