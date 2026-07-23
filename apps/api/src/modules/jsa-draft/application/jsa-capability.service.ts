import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, JsaDraftCapabilities, JsaDraftCapability } from '@jsams/shared-types';
import { AccessDeniedError } from '../../../common/errors/application-errors';

@Injectable()
export class JsaCapabilityService {
  constructor(private readonly config:ConfigService) {}
  capabilities(user:AuthenticatedUser):JsaDraftCapabilities {
    const codes = this.codes();
    const configured = Object.values(codes).every(Boolean);
    const has = (cap:JsaDraftCapability) => Boolean(codes[cap] && user.permissions.includes(codes[cap]!));
    return { view:has('view'), create:has('create'), edit:has('edit'), cancel:has('cancel'), configured,
      ...(!configured ? { unavailableReason:'JSA permission-code mapping is not configured' } : {}) };
  }
  require(user:AuthenticatedUser, capability:JsaDraftCapability):void {
    if (!this.capabilities(user)[capability]) throw new AccessDeniedError();
  }
  private codes():Record<JsaDraftCapability,string|undefined> {
    return { view:this.config.get<string>('JSA_PERMISSION_VIEW'), create:this.config.get<string>('JSA_PERMISSION_CREATE'), edit:this.config.get<string>('JSA_PERMISSION_EDIT'), cancel:this.config.get<string>('JSA_PERMISSION_CANCEL') };
  }
}
