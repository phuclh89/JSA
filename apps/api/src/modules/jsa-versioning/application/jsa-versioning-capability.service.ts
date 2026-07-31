import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  JsaVersioningCapabilities,
  JsaVersioningCapability,
} from '@jsams/shared-types';
import { AccessDeniedError } from '../../../common/errors/application-errors';

@Injectable()
export class JsaVersioningCapabilityService {
  constructor(private readonly config: ConfigService) {}

  state(user: AuthenticatedUser): JsaVersioningCapabilities {
    const codes = {
      update: this.config.get<string>('JSA_PERMISSION_UPDATE'),
      compare: this.config.get<string>('JSA_PERMISSION_COMPARE'),
      undoCheckout: this.config.get<string>('JSA_PERMISSION_UNDO_CHECKOUT'),
    };
    const missingMappings = Object.entries(codes)
      .filter(([, code]) => !code)
      .map(([capability]) => capability);
    const configured = missingMappings.length === 0;
    const has = (capability: JsaVersioningCapability) =>
      configured && Boolean(codes[capability] && user.permissions.includes(codes[capability]!));
    return {
      update: has('update'),
      compare: has('compare'),
      undoCheckout: has('undoCheckout'),
      configured,
      ...(!configured
        ? {
            unavailableReason: `Missing JSA revision permission mappings: ${missingMappings.join(', ')}`,
          }
        : {}),
    };
  }

  require(user: AuthenticatedUser, capability: JsaVersioningCapability): void {
    if (!this.state(user)[capability]) throw new AccessDeniedError();
  }
}
