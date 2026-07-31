import type { ConfigService } from '@nestjs/config';
import { JsaVersioningCapabilityService } from '../src/modules/jsa-versioning/application/jsa-versioning-capability.service';

const user = (permissions: string[]) =>
  ({
    userId: '1',
    username: 'tester',
    displayName: 'Test User',
    permissions,
  }) as any;

describe('JsaVersioningCapabilityService', () => {
  it('fails closed when any permission-code mapping is absent', () => {
    const config = {
      get: jest.fn((key: string) =>
        ({
          JSA_PERMISSION_UPDATE: 'JSA_UPDATE',
          JSA_PERMISSION_COMPARE: 'JSA_COMPARE',
        })[key],
      ),
    } as unknown as ConfigService;
    const service = new JsaVersioningCapabilityService(config);

    expect(service.state(user(['JSA_UPDATE', 'JSA_COMPARE']))).toMatchObject({
      configured: false,
      update: false,
      compare: false,
      undoCheckout: false,
    });
    expect(() => service.require(user(['JSA_UPDATE']), 'undoCheckout')).toThrow();
  });

  it('requires the independently mapped permission for each privileged action', () => {
    const config = {
      get: jest.fn((key: string) =>
        ({
          JSA_PERMISSION_UPDATE: 'JSA_UPDATE',
          JSA_PERMISSION_COMPARE: 'JSA_COMPARE',
          JSA_PERMISSION_UNDO_CHECKOUT: 'JSA_UNDO',
        })[key],
      ),
    } as unknown as ConfigService;
    const service = new JsaVersioningCapabilityService(config);
    const actor = user(['JSA_COMPARE']);

    expect(service.state(actor)).toEqual({
      configured: true,
      update: false,
      compare: true,
      undoCheckout: false,
    });
    expect(() => service.require(actor, 'compare')).not.toThrow();
    expect(() => service.require(actor, 'update')).toThrow();
  });
});
