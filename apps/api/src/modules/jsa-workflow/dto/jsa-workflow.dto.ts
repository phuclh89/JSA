import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
const id = /^\d{1,19}$/;
export class WorkflowActionDto {
  @IsString() @MaxLength(2000) @IsOptional() comment?: string;
}
export class SaveWorkflowDefinitionDto {
  @Matches(id) @IsOptional() id?: string;
  @Matches(id) @IsOptional() rowVersion?: string;
  @IsString() @MaxLength(50) code!: string;
  @IsInt() @Min(1) versionNumber!: number;
  @IsString() @MaxLength(200) name!: string;
  @IsIn(['DRAFT', 'ACTIVE', 'INACTIVE']) status!: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  @IsString() @IsOptional() effectiveFrom?: string;
  @IsString() @IsOptional() effectiveTo?: string;
  @IsArray() steps!: any[];
  @IsArray() bindings!: any[];
}
export class SaveWorkflowRoleAssignmentDto {
  @Matches(id) @IsOptional() id?: string;
  @Matches(id) @IsOptional() rowVersion?: string;
  @IsString() @MaxLength(50) workflowRoleCode!: string;
  @Matches(id) userId!: string;
  @Matches(id) siteId!: string;
  @Matches(id) @IsOptional() rigId?: string;
  @Matches(id) @IsOptional() departmentId?: string;
  @IsString() effectiveFrom!: string;
  @IsString() @IsOptional() effectiveTo?: string;
  @IsBoolean() active!: boolean;
}
