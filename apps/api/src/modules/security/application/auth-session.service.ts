import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { UnauthenticatedError } from '../../../common/errors/application-errors';
import type { EnterprisePrincipal } from '../domain/security.types';

interface SessionSettings {
  secret: string;
  ttlMinutes: number;
  cookieName: string;
  secure: boolean;
}

interface SessionIssue {
  cookie: string;
  expiresAt: string;
}

@Injectable()
export class AuthSessionService {
  constructor(private readonly config: ConfigService) {}

  async issue(principal: EnterprisePrincipal): Promise<SessionIssue> {
    const settings = this.settings();
    const now = Math.floor(Date.now() / 1000);
    const expires = now + settings.ttlMinutes * 60;
    const token = await new SignJWT({
      username: principal.username,
      displayName: principal.displayName,
      email: principal.email,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(principal.identityKey)
      .setIssuedAt(now)
      .setExpirationTime(expires)
      .setIssuer('jsams-api')
      .setAudience('jsams-web')
      .sign(this.key(settings.secret));
    return {
      cookie: this.serialize(settings.cookieName, token, settings.ttlMinutes * 60, settings.secure),
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  async verify(cookieHeader: string | undefined): Promise<EnterprisePrincipal> {
    const settings = this.settings();
    const token = readCookie(cookieHeader, settings.cookieName);
    if (!token) throw new UnauthenticatedError();
    try {
      const { payload } = await jwtVerify(token, this.key(settings.secret), {
        issuer: 'jsams-api',
        audience: 'jsams-web',
        algorithms: ['HS256'],
      });
      if (!payload.sub || typeof payload.username !== 'string') throw new UnauthenticatedError();
      return {
        identityKey: payload.sub,
        username: payload.username,
        ...(typeof payload.displayName === 'string' ? { displayName: payload.displayName } : {}),
        ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
        mode: 'ldap',
        allowUsernameFallback: Boolean(this.config.get<boolean>('auth.ldap.allowUsernameFallback')),
        ...(typeof payload.exp === 'number'
          ? { sessionExpiresAt: new Date(payload.exp * 1000).toISOString() }
          : {}),
      };
    } catch {
      throw new UnauthenticatedError();
    }
  }

  clearCookie(): string {
    const settings = this.settings();
    return this.serialize(settings.cookieName, '', 0, settings.secure);
  }

  private settings(): SessionSettings {
    return this.config.getOrThrow<SessionSettings>('auth.session');
  }

  private key(secret: string): Uint8Array {
    return new TextEncoder().encode(secret);
  }

  private serialize(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
    return [
      `${name}=${value}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      ...(secure ? ['Secure'] : []),
    ].join('; ');
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name)
      return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return undefined;
}
