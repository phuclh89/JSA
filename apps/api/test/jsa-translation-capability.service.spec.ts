import type { ConfigService } from '@nestjs/config';
import { JsaTranslationCapabilityService } from '../src/modules/jsa-translation/application/jsa-translation-capability.service';

const configured = {
  JSA_PERMISSION_VIEW: 'JSA_VIEW',
  JSA_PERMISSION_TRANSLATION_VIEW: 'TRANSLATION_VIEW',
  JSA_PERMISSION_TRANSLATION_ASSIGN: 'TRANSLATION_ASSIGN',
  JSA_PERMISSION_TRANSLATE: 'TRANSLATE',
  JSA_PERMISSION_TRANSLATION_APPROVE: 'TRANSLATION_APPROVE',
  JSA_PERMISSION_TRANSLATION_PRINT: 'TRANSLATION_PRINT',
};
const user = (permissions: string[]) => ({ permissions }) as any;

describe('JsaTranslationCapabilityService', () => {
  it('fails closed for partial mappings', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'JSA_PERMISSION_TRANSLATION_PRINT' ? undefined : (configured as any)[key],
      ),
    } as unknown as ConfigService;
    const service = new JsaTranslationCapabilityService(config);
    expect(service.state(user(Object.values(configured)))).toMatchObject({
      configured: false,
      print: false,
    });
    expect(() => service.require(user(Object.values(configured)), 'view')).toThrow();
  });

  it('keeps every capability independent and gives SYSTEM_ADMIN no bypass', () => {
    const config = {
      get: jest.fn((key: string) => (configured as any)[key]),
    } as unknown as ConfigService;
    const service = new JsaTranslationCapabilityService(config);
    expect(service.state(user(['SYSTEM_ADMIN', 'JSA_VIEW']))).toMatchObject({
      configured: true,
      view: false,
      assign: false,
      translate: false,
      approve: false,
      print: false,
    });
    expect(service.state(user(Object.values(configured)))).toMatchObject({
      configured: true,
      view: true,
      assign: true,
      translate: true,
      approve: true,
      print: true,
    });
  });
});
