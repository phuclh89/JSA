import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ReferenceScopeType } from '@jsams/shared-types';

const idPattern = /^\d{1,19}$/;

export class MasterDataListQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize = 20;
  @IsString() @MaxLength(200) @IsOptional() keyword?: string;
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  @IsOptional()
  active?: boolean;
  @Matches(idPattern) @IsOptional() siteId?: string;
  @Matches(idPattern) @IsOptional() rigId?: string;
  @Matches(idPattern) @IsOptional() departmentId?: string;
  @Matches(idPattern) @IsOptional() categoryId?: string;
}

export class MasterDataMutationDto {
  @IsString() @MaxLength(150) code!: string;
  @IsString() @MaxLength(500) name!: string;
  @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @IsInt() @Min(0) @Max(999999) displayOrder!: number;
  @IsIn(['GLOBAL', 'SITE', 'RIG', 'DEPARTMENT']) scopeType!: ReferenceScopeType;
  @Matches(idPattern) @IsOptional() siteId?: string;
  @Matches(idPattern) @IsOptional() rigId?: string;
  @Matches(idPattern) @IsOptional() departmentId?: string;
  @IsObject() attributes: Record<string, string | number | boolean | null> = {};
  @Matches(idPattern) @IsOptional() rowVersion?: string;
}

export class ActiveMutationDto {
  @Matches(idPattern) rowVersion!: string;
}
