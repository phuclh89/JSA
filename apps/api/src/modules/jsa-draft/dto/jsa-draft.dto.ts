import { IsArray,IsBoolean,IsOptional,IsString,Matches,MaxLength } from 'class-validator';
const id=/^\d{1,19}$/;
export class CreateJsaDraftDto {@Matches(id) ownerSiteId!:string;@Matches(id) rigId!:string;@Matches(id) departmentId!:string;@Matches(id) jobTypeId!:string;@Matches(id) @IsOptional() languageId?:string;}
export class UpdateJsaHeaderDto {@Matches(id) rowVersion!:string;@Matches(id) versionRowVersion!:string;@Matches(id) jobTypeId!:string;@Matches(id) @IsOptional() languageId?:string;@IsString() @MaxLength(500) @IsOptional() jobTitle?:string;@IsString() @IsOptional() jobDescription?:string;@IsString() @MaxLength(500) @IsOptional() location?:string;@IsString() @MaxLength(1000) @IsOptional() personnel?:string;@IsBoolean() @IsOptional() ptwRequired?:boolean;@IsString() @MaxLength(500) @IsOptional() ptwReference?:string;}
export class SaveJsaContentDto {@Matches(id) versionRowVersion!:string;@IsArray() prompts!:any[];@IsArray() tasks!:any[];@IsArray() coverage!:any[];@IsArray() basicSteps!:any[];@IsArray() procedureReferences!:any[];@IsArray() attachments!:any[];}
export class CancelJsaDraftDto {@Matches(id) rowVersion!:string;@Matches(id) versionRowVersion!:string;}
export class ResolveJsaRiskDto {@Matches(id) @IsOptional() likelihoodId?:string;@Matches(id) @IsOptional() severityId?:string;}
