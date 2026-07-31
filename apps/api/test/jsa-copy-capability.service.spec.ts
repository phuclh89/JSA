import type { ConfigService } from '@nestjs/config';
import { JsaCopyCapabilityService } from '../src/modules/jsa-copy/application/jsa-copy-capability.service';

const user = (permissions: string[]) =>
  ({
    userId: '1',
    username: 'tester',
    displayName: 'Test User',
    permissions,
  }) as any;

describe('JsaCopyCapabilityService', () => {
  const configured = {
    JSA_PERMISSION_VIEW: 'JSA_VIEW',
    JSA_PERMISSION_CREATE: 'JSA_CREATE',
    JSA_PERMISSION_COPY: 'JSA_COPY',
  };

  it('fails closed when the independent Copy mapping is absent', () => {
    const config = {
      get: jest.fn(
        (key: string) =>
          (({ JSA_PERMISSION_VIEW: 'JSA_VIEW', JSA_PERMISSION_CREATE: 'JSA_CREATE' }) as any)[key],
      ),
    } as unknown as ConfigService;
    const service = new JsaCopyCapabilityService(config);

    expect(service.state(user(['JSA_VIEW', 'JSA_CREATE']))).toMatchObject({
      configured: false,
      view: true,
      create: true,
      copy: false,
    });
    expect(() => service.require(user(['JSA_VIEW', 'JSA_CREATE']))).toThrow();
  });

  it('requires View, Create, and Copy independently without an administrator bypass', () => {
    const config = {
      get: jest.fn((key: string) => (configured as any)[key]),
    } as unknown as ConfigService;
    const service = new JsaCopyCapabilityService(config);

    expect(service.state(user(['JSA_COPY', 'SYSTEM_ADMIN']))).toMatchObject({
      configured: true,
      view: false,
      create: false,
      copy: true,
    });
    expect(() => service.require(user(['JSA_COPY', 'SYSTEM_ADMIN']))).toThrow();
    expect(() => service.require(user(Object.values(configured)))).not.toThrow();
  });
});
