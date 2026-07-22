import { Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb from 'oracledb';
import { JsonLogger } from '../logging/json-logger.service';
import { initializeOracleClient, type OracleClientMode } from './oracle-client';
import type { OracleExecutor, OracleTransactionContext } from './oracle.types';

@Injectable()
export class OracleService implements OracleExecutor, OnModuleInit, OnApplicationShutdown {
  private pool?: oracledb.Pool;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: JsonLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    initializeOracleClient(
      {
        clientMode: this.config.getOrThrow<OracleClientMode>('oracle.clientMode'),
        clientLibDir: this.config.get<string>('oracle.clientLibDir'),
      },
      (entry) => this.logger.log(entry, OracleService.name),
    );
    this.pool = await oracledb.createPool({
      user: this.config.getOrThrow<string>('oracle.user'),
      password: this.config.getOrThrow<string>('oracle.password'),
      connectString: this.config.getOrThrow<string>('oracle.connectString'),
      poolMin: this.config.getOrThrow<number>('oracle.poolMin'),
      poolMax: this.config.getOrThrow<number>('oracle.poolMax'),
      poolIncrement: this.config.getOrThrow<number>('oracle.poolIncrement'),
      poolTimeout: this.config.getOrThrow<number>('oracle.poolTimeout'),
      queueTimeout: this.config.getOrThrow<number>('oracle.queueTimeout'),
      stmtCacheSize: this.config.getOrThrow<number>('oracle.stmtCacheSize'),
      events: this.config.getOrThrow<boolean>('oracle.enableEvents'),
    });
    this.logger.log({ result: 'oracle_pool_opened' }, OracleService.name);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.close(10);
      this.pool = undefined;
      this.logger.log({ result: 'oracle_pool_closed' }, OracleService.name);
    }
  }

  async execute<T>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: oracledb.ExecuteOptions = {},
  ): Promise<oracledb.Result<T>> {
    const connection = await this.getConnection();
    try {
      return await connection.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        ...options,
      });
    } finally {
      await connection.close();
    }
  }

  async withTransaction<T>(handler: (context: OracleTransactionContext) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    try {
      const result = await handler({ connection });
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        this.logger.error(
          {
            result: 'oracle_transaction_rollback_failed',
            rollbackErrorCode: (rollbackError as { code?: string }).code,
          },
          undefined,
          OracleService.name,
        );
      }
      throw error;
    } finally {
      await connection.close();
    }
  }

  private async getConnection(): Promise<oracledb.Connection> {
    if (!this.pool) throw new Error('Oracle pool is not initialized');
    return this.pool.getConnection();
  }
}
