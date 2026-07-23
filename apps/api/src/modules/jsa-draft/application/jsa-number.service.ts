import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import { StateConflictError } from '../../../common/errors/application-errors';
import oracledb from 'oracledb';

@Injectable()
export class JsaNumberService {
  constructor(private readonly config:ConfigService) {}
  async next(context:OracleTransactionContext, siteId:string):Promise<{number:string;scopeKey:string}> {
    const template=this.config.get<string>('JSA_NUMBER_TEMPLATE');
    const scope=this.config.get<string>('JSA_NUMBER_UNIQUENESS_SCOPE');
    if (!template || !template.includes('{sequence}') || !['GLOBAL','SITE'].includes(scope ?? ''))
      throw new StateConflictError('JSA numbering configuration is unavailable');
    const result=await context.connection.execute<{VALUE:string}>(`SELECT TO_CHAR(SEQ_JSA_BUSINESS_NUMBER.NEXTVAL) VALUE FROM DUAL`,{}, { outFormat:oracledb.OUT_FORMAT_OBJECT });
    const value=result.rows?.[0]?.VALUE;
    if (!value) throw new StateConflictError('JSA business number could not be generated');
    const generated=template.replaceAll('{sequence}',value).replaceAll('{siteId}',siteId);
    if(generated.length>100)throw new StateConflictError('Configured JSA business number exceeds 100 characters');
    return { number:generated, scopeKey:scope==='GLOBAL'?'GLOBAL':siteId };
  }
}
