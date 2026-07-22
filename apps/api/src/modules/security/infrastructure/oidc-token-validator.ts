import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { TokenValidator } from '../../../common/auth/token-validator.interface';

@Injectable()
export class OidcTokenValidator implements TokenValidator {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async validate(token: string): Promise<Record<string, unknown>> {
    const tenantId = this.config.getOrThrow<string>('auth.tenantId');
    const audience = this.config.getOrThrow<string>('auth.audience');
    const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    this.jwks ??= createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
    );
    const result = await jwtVerify(token, this.jwks, { audience, issuer });
    return result.payload as JWTPayload & Record<string, unknown>;
  }
}
