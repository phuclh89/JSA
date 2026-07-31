import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, TranslationCapabilities } from '@jsams/shared-types';
import { AccessDeniedError, StateConflictError } from '../../../common/errors/application-errors';

export type TranslationCapability = 'view' | 'assign' | 'translate' | 'approve' | 'print';

@Injectable()
export class JsaTranslationCapabilityService {
  private readonly keys: Record<TranslationCapability, string> = {
    view: 'JSA_PERMISSION_TRANSLATION_VIEW',
    assign: 'JSA_PERMISSION_TRANSLATION_ASSIGN',
    translate: 'JSA_PERMISSION_TRANSLATE',
    approve: 'JSA_PERMISSION_TRANSLATION_APPROVE',
    print: 'JSA_PERMISSION_TRANSLATION_PRINT',
  };

  constructor(private readonly config: ConfigService) {}

  state(user: AuthenticatedUser): TranslationCapabilities {
    const codes = Object.fromEntries(
      Object.entries(this.keys).map(([name, key]) => [name, this.config.get<string>(key)]),
    ) as Record<TranslationCapability, string | undefined>;
    const viewJsa = this.config.get<string>('JSA_PERMISSION_VIEW');
    const configured = Boolean(viewJsa && Object.values(codes).every(Boolean));
    return {
      view: Boolean(
        codes.view &&
        viewJsa &&
        user.permissions.includes(codes.view) &&
        user.permissions.includes(viewJsa),
      ),
      assign: Boolean(codes.assign && user.permissions.includes(codes.assign)),
      translate: Boolean(codes.translate && user.permissions.includes(codes.translate)),
      approve: Boolean(codes.approve && user.permissions.includes(codes.approve)),
      print: Boolean(codes.print && user.permissions.includes(codes.print)),
      configured,
      ...(!configured
        ? {
            unavailableReason:
              'All Translation and JSA View permission mappings must be configured',
          }
        : {}),
    };
  }

  code(capability: TranslationCapability): string {
    const code = this.config.get<string>(this.keys[capability]);
    if (!code)
      throw new StateConflictError(
        `Translation ${capability} permission mapping is not configured`,
      );
    return code;
  }

  require(user: AuthenticatedUser, capability: TranslationCapability): void {
    const state = this.state(user);
    if (!state.configured)
      throw new StateConflictError('Translation permission mappings are not configured');
    if (!state[capability]) throw new AccessDeniedError();
  }
}
