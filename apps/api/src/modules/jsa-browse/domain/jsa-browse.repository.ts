import type { JsaBrowseFacets, JsaBrowseResult } from '@jsams/shared-types';
import type { OracleTransactionContext } from '../../../common/oracle/oracle.types';
import type { JsaBrowseQuery } from './jsa-browse.types';

export const JSA_BROWSE_REPOSITORY = Symbol('JSA_BROWSE_REPOSITORY');

export interface JsaBrowseRepository {
  browse(context: OracleTransactionContext, query: JsaBrowseQuery): Promise<JsaBrowseResult>;
  favoriteCount(
    context: OracleTransactionContext,
    userId: string,
    rigId?: string,
  ): Promise<number>;
  allCount(context: OracleTransactionContext, userId: string, rigId?: string): Promise<number>;
  facets(
    context: OracleTransactionContext,
    userId: string,
    rigId?: string,
  ): Promise<JsaBrowseFacets>;
  setFavorite(
    context: OracleTransactionContext,
    input: {
      jsaId: string;
      userId: string;
      username: string;
      localSiteId: string;
      active: boolean;
    },
  ): Promise<boolean>;
}
