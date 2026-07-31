import { IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const id = /^\d{1,19}$/;
export class JsaCopyPreflightDto {
  @Matches(id) destinationSiteId!: string;
  @Matches(id) destinationRigId!: string;
  @Matches(id) destinationDepartmentId!: string;
}
export class JsaCopyCommandDto extends JsaCopyPreflightDto {
  @IsString() @MinLength(1) @MaxLength(1000) copyReason!: string;
  @IsBoolean() acknowledgeWarnings!: boolean;
}
