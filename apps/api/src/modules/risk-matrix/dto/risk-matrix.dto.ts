import { IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const idPattern = /^\d{1,19}$/;
export class MatrixMutationDto {
  @IsString() @MaxLength(50) code!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsIn([3, 5]) dimension!: 3 | 5;
  @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @Matches(idPattern) @IsOptional() rowVersion?: string;
}
export class VersionMutationDto {
  @IsString() @MaxLength(50) versionCode!: string;
  @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @IsString() @IsOptional() effectiveFrom?: string;
  @IsString() @IsOptional() effectiveTo?: string;
  @Matches(idPattern) @IsOptional() rowVersion?: string;
}
export class ConfigurationMutationDto {
  @Matches(idPattern) rowVersion!: string;
  @IsArray() likelihoods!: Array<Record<string, unknown>>;
  @IsArray() severities!: Array<Record<string, unknown>>;
  @IsArray() results!: Array<Record<string, unknown>>;
  @IsArray() cells!: Array<Record<string, unknown>>;
}
export class AssignmentMutationDto {
  @Matches(idPattern) rigId!: string;
  @Matches(idPattern) matrixVersionId!: string;
  @IsString() effectiveFrom!: string;
  @IsString() @IsOptional() effectiveTo?: string;
  @IsString() @MaxLength(1000) reason!: string;
  @Matches(idPattern) @IsOptional() rowVersion?: string;
}
export class EndAssignmentDto {
  @IsString() effectiveTo!: string;
  @IsString() @MaxLength(1000) reason!: string;
  @Matches(idPattern) rowVersion!: string;
}
export class ActiveMatrixDto {
  @Matches(idPattern) rowVersion!: string;
}
