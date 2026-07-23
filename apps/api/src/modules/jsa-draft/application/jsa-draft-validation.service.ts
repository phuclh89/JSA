import { Injectable } from '@nestjs/common';
import type { JsaDraftDetail,JsaValidationIssue,JsaValidationResult } from '@jsams/shared-types';
import { ValidationError } from '../../../common/errors/application-errors';
import type { SaveDraftContentInput } from '../domain/jsa-draft.types';

@Injectable()
export class JsaDraftValidationService {
  structural(input:SaveDraftContentInput):void {
    const walk=(value:unknown,key='')=>{if(Array.isArray(value)){value.forEach(x=>walk(x));return;}if(value&&typeof value==='object'){for(const [childKey,child] of Object.entries(value))walk(child,childKey);return;}if(value!==undefined&&value!==null&&(key==='id'||key==='rowVersion'||key.endsWith('Id'))&&(typeof value!=='string'||!/^\d{1,19}$/.test(value)))throw new ValidationError(`${key} must be a decimal ID string`);};walk(input);
    const refs:string[]=[];const add=(ref:string)=>{if(!ref?.trim()||refs.includes(ref))throw new ValidationError('Every draft item requires a unique ref');refs.push(ref);};
    input.prompts.forEach(x=>add(x.ref)); input.tasks.forEach(t=>{add(t.ref);t.hazards.forEach(h=>{add(h.ref);h.controls.forEach(c=>add(c.ref));});}); input.coverage.forEach(x=>add(x.ref)); input.basicSteps.forEach(s=>{add(s.ref);s.performers.forEach(x=>add(x.ref));s.supervisors.forEach(x=>add(x.ref));s.tools.forEach(x=>add(x.ref));}); input.procedureReferences.forEach(x=>add(x.ref));input.attachments.forEach(x=>add(x.ref));
    const taskRefs=new Set(input.tasks.map(x=>x.ref));for(const task of input.tasks)if(task.parentRef&&!taskRefs.has(task.parentRef))throw new ValidationError('Task parent reference is invalid');
    for(const task of input.tasks){const seen=new Set<string>([task.ref]);let parent=task.parentRef;let depth=0;while(parent){if(seen.has(parent))throw new ValidationError('Task hierarchy contains a cycle');seen.add(parent);parent=input.tasks.find(x=>x.ref===parent)?.parentRef;if(++depth>10)throw new ValidationError('Task hierarchy exceeds the supported depth of 10');}}
    for(const step of input.basicSteps){if(step.taskRef&&!taskRefs.has(step.taskRef))throw new ValidationError('Basic Job Step task reference is invalid');if(step.noToolRequired&&step.tools.length)throw new ValidationError('A Basic Job Step cannot select Tools and No tool required together');}
  }
  validate(draft:JsaDraftDetail):JsaValidationResult {
    const errors:JsaValidationIssue[]=[];const warnings:JsaValidationIssue[]=[];const issue=(code:string,section:JsaValidationIssue['section'],message:string,field?:string,entityType?:string,entityId?:string)=>errors.push({code,section,message,...(field?{field}:{}),...(entityType?{entityType}:{}),...(entityId?{entityId}:{} )});
    if(!draft.jobTitle?.trim())issue('JOB_TITLE_REQUIRED','GENERAL','Job title is required','jobTitle');
    if(!draft.jobTypeId)issue('JOB_TYPE_REQUIRED','GENERAL','Job Type is required','jobTypeId');
    if(draft.ptwRequired&&!draft.ptwReference?.trim())issue('PTW_REFERENCE_REQUIRED','GENERAL','PTW reference is required when PTW is required','ptwReference');
    if(!draft.tasks.length)issue('TASK_REQUIRED','RISK','At least one Task is required');
    for(const task of draft.tasks){if(!task.title.trim())issue('TASK_TITLE_REQUIRED','RISK','Task title is required','title','TASK',task.id);if(!task.hazards.length)issue('HAZARD_REQUIRED','RISK','Every Task requires at least one Hazard',undefined,'TASK',task.id);for(const hazard of task.hazards){if(!hazard.text.trim())issue('HAZARD_TEXT_REQUIRED','RISK','Hazard text is required','text','HAZARD',hazard.id);if(!hazard.controls.length)issue('CONTROL_REQUIRED','RISK','Every Hazard requires at least one Control',undefined,'HAZARD',hazard.id);if(!hazard.initialRisk.cellId)issue('INITIAL_RISK_REQUIRED','RISK','Initial Risk is required','initialRisk','HAZARD',hazard.id);if(!hazard.residualRisk.cellId)issue('RESIDUAL_RISK_REQUIRED','RISK','Residual Risk is required','residualRisk','HAZARD',hazard.id);if(hazard.residualRisk.prohibited)issue('RESIDUAL_RISK_PROHIBITED','RISK','Residual Risk is prohibited by the configured matrix','residualRisk','HAZARD',hazard.id);}}
    const covered=new Set(draft.promptCoverage.map(x=>x.promptId));for(const prompt of draft.prompts)if(prompt.selected&&!covered.has(prompt.id))issue('PROMPT_COVERAGE_REQUIRED','PROMPTS','Every selected prompt must link to a Hazard or Control',undefined,'PROMPT',prompt.id);
    if(!draft.basicSteps.length)issue('BASIC_STEP_REQUIRED','BASIC_STEPS','At least one Basic Job Step is required');for(const step of draft.basicSteps){if(!step.text.trim())issue('BASIC_STEP_TEXT_REQUIRED','BASIC_STEPS','Step text is required','text','BASIC_STEP',step.id);if(!step.performers.length)issue('PERFORMER_REQUIRED','BASIC_STEPS','At least one Performer Position is required',undefined,'BASIC_STEP',step.id);if(!step.supervisors.length)issue('SUPERVISOR_REQUIRED','BASIC_STEPS','At least one Supervisor Position is required',undefined,'BASIC_STEP',step.id);if(!step.noToolRequired&&!step.tools.length)issue('TOOL_DECISION_REQUIRED','BASIC_STEPS','Select at least one Tool or No tool required',undefined,'BASIC_STEP',step.id);if(step.noToolRequired&&step.tools.length)issue('TOOL_DECISION_CONFLICT','BASIC_STEPS','Tools conflict with No tool required',undefined,'BASIC_STEP',step.id);}
    for(const attachment of draft.attachments)if(attachment.status!=='STORED')issue('ATTACHMENT_NOT_STORED','REFERENCES','Attachment content has not been stored',undefined,'ATTACHMENT',attachment.id);
    if(!draft.procedureReferences.length)warnings.push({code:'NO_PROCEDURE_REFERENCE',section:'REFERENCES',message:'No Procedure Reference has been added'});
    return {valid:errors.length===0,errors,warnings,generatedAt:new Date().toISOString()};
  }
}
