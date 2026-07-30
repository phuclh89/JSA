import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PageDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}
export class RegisterUserDto {
  @IsString() @IsNotEmpty() enterpriseIdentityKey!: string;
  @IsString() @IsNotEmpty() username!: string;
  @IsString() @IsNotEmpty() displayName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() defaultSiteId?: string;
  @IsOptional() @IsString() defaultRigId?: string;
  @IsOptional() @IsString() defaultDepartmentId?: string;
  @IsOptional() @IsBoolean() active = true;
}
export class UpdateUserDto {
  @IsString() @IsNotEmpty() displayName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() defaultSiteId?: string;
  @IsOptional() @IsString() defaultRigId?: string;
  @IsOptional() @IsString() defaultDepartmentId?: string;
  @IsString() rowVersion!: string;
}
export class LifecycleDto {
  @IsString() rowVersion!: string;
  @IsString() @IsNotEmpty() reason!: string;
}
export class CreateRoleDto {
  @IsString() @IsNotEmpty() roleCode!: string;
  @IsString() @IsNotEmpty() roleName!: string;
  @IsOptional() @IsString() description?: string;
}
export class UpdateRoleDto {
  @IsString() @IsNotEmpty() roleName!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() rowVersion!: string;
}
export class AssignmentDto {
  @IsOptional() @IsString() rowVersion?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() permissionId?: string;
  @IsOptional() @IsString() workflowRoleCode?: string;
  @IsOptional() @IsString() siteId?: string;
  @IsOptional() @IsString() rigId?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsIn(['ALLOW', 'DENY']) effect?: 'ALLOW' | 'DENY';
  @IsOptional() @IsIn(['SITE', 'RIG', 'DEPARTMENT']) scopeType?: string;
  @IsOptional() @IsBoolean() canView?: boolean;
  @IsOptional() @IsBoolean() canAct?: boolean;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsISO8601() effectiveTo?: string;
}
export class RevokeAssignmentDto extends LifecycleDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() permissionId?: string;
  @IsOptional() @IsIn(['ALLOW', 'DENY']) effect?: 'ALLOW' | 'DENY';
}
export class ApproverPreviewDto {
  @IsString() siteId!: string;
  @IsString() rigId!: string;
  @IsString() departmentId!: string;
  @IsString() jobTypeId!: string;
  @IsOptional() @IsString() jsaVersionId?: string;
  @IsOptional() @IsISO8601() effectiveAt?: string;
}
