import type oracledb from 'oracledb';

export interface OracleTransactionContext {
  connection: oracledb.Connection;
}
export interface OracleExecutor {
  execute<T>(
    sql: string,
    binds?: oracledb.BindParameters,
    options?: oracledb.ExecuteOptions,
  ): Promise<oracledb.Result<T>>;
  withTransaction<T>(handler: (context: OracleTransactionContext) => Promise<T>): Promise<T>;
}
