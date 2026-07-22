import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb from 'oracledb';
import { OracleService } from '../../../common/oracle/oracle.service';
import { assertOracleId } from '../../../common/oracle/oracle-id';

interface CountRow {
  ITEM_COUNT: number;
}

@Injectable()
export class SequenceRangeValidatorService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly oracle: OracleService,
  ) {}

  async onModuleInit(): Promise<void> {
    const localSiteId = this.config.get<string>('app.siteId');
    if (!localSiteId) return;
    assertOracleId(localSiteId, 'LOCAL_SITE_ID');
    const overlap = await this.oracle.execute<CountRow>(
      `SELECT COUNT(*) AS ITEM_COUNT
       FROM SYS_SITE_SEQUENCE_RANGE A
       JOIN SYS_SITE_SEQUENCE_RANGE B ON A.RANGE_ID < B.RANGE_ID
        AND A.IS_ACTIVE = 'Y' AND B.IS_ACTIVE = 'Y'
        AND A.SEQUENCE_CODE = B.SEQUENCE_CODE
        AND A.SITE_ID <> B.SITE_ID
        AND A.RANGE_START <= B.RANGE_END AND B.RANGE_START <= A.RANGE_END`,
    );
    if ((overlap.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Active site sequence ranges overlap');
    const invalid = await this.oracle.execute<CountRow>(
      `SELECT COUNT(*) AS ITEM_COUNT
       FROM USER_SEQUENCES S
       LEFT JOIN SYS_SITE_SEQUENCE_RANGE R
         ON R.SITE_ID = :siteId AND R.SEQUENCE_CODE = S.SEQUENCE_NAME
        AND R.IS_ACTIVE = 'Y' AND R.EFFECTIVE_FROM <= SYSTIMESTAMP
        AND (R.EFFECTIVE_TO IS NULL OR R.EFFECTIVE_TO >= SYSTIMESTAMP)
       WHERE S.SEQUENCE_NAME IN (
         'SEQ_SYS_SITE','SEQ_SYS_RIG','SEQ_SYS_DEPARTMENT','SEQ_SYS_SITE_SEQ_RANGE',
         'SEQ_SYS_USER','SEQ_SYS_ROLE','SEQ_SYS_PERMISSION','SEQ_SYS_USER_ROLE',
         'SEQ_SYS_ROLE_PERMISSION','SEQ_SYS_USER_PERM_OVERRIDE','SEQ_SYS_USER_DATA_SCOPE'
       )
       AND (R.RANGE_ID IS NULL OR S.LAST_NUMBER < R.RANGE_START OR S.LAST_NUMBER > R.RANGE_END)`,
      { siteId: localSiteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((invalid.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
      throw new Error('Local Oracle sequences are missing a valid configured site range');
  }
}
