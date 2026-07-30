import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AndFilter, Client, EqualityFilter, InvalidCredentialsError } from 'ldapts';
import {
  EnterpriseAuthenticationUnavailableError,
  InvalidEnterpriseCredentialsError,
} from '../../../common/errors/application-errors';
import type { EnterprisePrincipal } from '../domain/security.types';

interface LdapSettings {
  strategy: 'SERVICE_SEARCH' | 'DIRECT_BIND';
  host: string;
  port: number;
  bindDn?: string;
  bindPassword?: string;
  searchBase: string;
  usernameAttribute: string;
  emailAttribute: string;
  displayNameAttribute: string;
  identityAttribute: string;
  upnSuffix: string;
  netbiosDomain: string;
  tlsMode: 'LDAPS' | 'STARTTLS' | 'NONE';
  legacyTlsCompatibility: boolean;
  connectTimeoutMs: number;
  operationTimeoutMs: number;
  allowUsernameFallback: boolean;
}

@Injectable()
export class LdapAuthenticationService {
  constructor(private readonly config: ConfigService) {}

  async authenticate(usernameInput: string, password: string): Promise<EnterprisePrincipal> {
    const settings = this.config.getOrThrow<LdapSettings>('auth.ldap');
    const username = normalizeLoginName(usernameInput);
    if (!username || !password) throw new InvalidEnterpriseCredentialsError();

    if (settings.strategy === 'DIRECT_BIND') {
      return this.authenticateDirect(usernameInput, username, password, settings);
    }

    if (!settings.bindDn || !settings.bindPassword) {
      throw new EnterpriseAuthenticationUnavailableError();
    }
    const client = this.client(settings);

    try {
      if (settings.tlsMode === 'STARTTLS') await client.startTLS();
      await client.bind(settings.bindDn, settings.bindPassword);
      const result = await this.findUser(client, username, settings);
      if (result.searchEntries.length !== 1) throw new InvalidEnterpriseCredentialsError();
      const entry = result.searchEntries[0]!;
      await client.bind(entry.dn, password);

      return principalFromEntry(entry, username, settings);
    } catch (error) {
      if (
        error instanceof InvalidEnterpriseCredentialsError ||
        error instanceof InvalidCredentialsError
      ) {
        throw new InvalidEnterpriseCredentialsError();
      }
      throw new EnterpriseAuthenticationUnavailableError();
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private async authenticateDirect(
    usernameInput: string,
    username: string,
    password: string,
    settings: LdapSettings,
  ): Promise<EnterprisePrincipal> {
    for (const bindName of buildBindCandidates(
      usernameInput,
      settings.upnSuffix,
      settings.netbiosDomain,
    )) {
      const client = this.client(settings);
      try {
        if (settings.tlsMode === 'STARTTLS') await client.startTLS();
        await client.bind(bindName, password);
        const result = await this.findUser(client, username, settings);
        if (result.searchEntries.length !== 1) throw new InvalidEnterpriseCredentialsError();
        return principalFromEntry(result.searchEntries[0]!, username, settings);
      } catch (error) {
        if (error instanceof InvalidEnterpriseCredentialsError) throw error;
        if (!(error instanceof InvalidCredentialsError)) {
          throw new EnterpriseAuthenticationUnavailableError();
        }
      } finally {
        await client.unbind().catch(() => undefined);
      }
    }
    throw new InvalidEnterpriseCredentialsError();
  }

  private findUser(client: Client, username: string, settings: LdapSettings) {
    return client.search(settings.searchBase, {
      scope: 'sub',
      filter: new AndFilter({
        filters: [
          new EqualityFilter({ attribute: 'objectCategory', value: 'person' }),
          new EqualityFilter({ attribute: settings.usernameAttribute, value: username }),
        ],
      }),
      attributes: [
        settings.usernameAttribute,
        settings.displayNameAttribute,
        settings.emailAttribute,
        settings.identityAttribute,
      ],
      explicitBufferAttributes: [settings.identityAttribute],
      sizeLimit: 2,
      timeLimit: Math.max(1, Math.ceil(settings.operationTimeoutMs / 1000)),
    });
  }

  private client(settings: LdapSettings): Client {
    const scheme = settings.tlsMode === 'LDAPS' ? 'ldaps' : 'ldap';
    return new Client({
      url: `${scheme}://${settings.host}:${settings.port}`,
      connectTimeout: settings.connectTimeoutMs,
      timeout: settings.operationTimeoutMs,
      ...(settings.legacyTlsCompatibility
        ? {
            tlsOptions: {
              minVersion: 'TLSv1',
              ciphers: 'DEFAULT:@SECLEVEL=0',
              rejectUnauthorized: false,
            } as const,
          }
        : {}),
    });
  }
}

export function normalizeLoginName(value: string): string {
  const trimmed = value.trim();
  const slash = trimmed.lastIndexOf('\\');
  const withoutDomain = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  const at = withoutDomain.indexOf('@');
  return (at > 0 ? withoutDomain.slice(0, at) : withoutDomain).trim();
}

export function buildBindCandidates(
  usernameInput: string,
  upnSuffix: string,
  netbiosDomain: string,
): string[] {
  const original = usernameInput.trim();
  const accountName = normalizeLoginName(original);
  const candidates = [
    original,
    accountName,
    `${accountName}@${upnSuffix}`,
    `${netbiosDomain}\\${accountName}`,
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.toLowerCase();
    if (!candidate || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function principalFromEntry(
  entry: Record<string, Buffer | Buffer[] | string[] | string>,
  fallbackUsername: string,
  settings: LdapSettings,
): EnterprisePrincipal {
  const canonicalUsername = firstText(entry[settings.usernameAttribute]) ?? fallbackUsername;
  const identityValue = entry[settings.identityAttribute];
  const identityKey = ldapIdentityKey(identityValue, canonicalUsername);
  const displayName = firstText(entry[settings.displayNameAttribute]);
  const email = firstText(entry[settings.emailAttribute]);
  return {
    identityKey,
    username: canonicalUsername,
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    mode: 'ldap',
    allowUsernameFallback: settings.allowUsernameFallback,
  };
}

function firstText(value: Buffer | Buffer[] | string[] | string | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first.trim() || undefined;
  if (Buffer.isBuffer(first)) return first.toString('utf8').trim() || undefined;
  return undefined;
}

function ldapIdentityKey(
  value: Buffer | Buffer[] | string[] | string | undefined,
  fallbackUsername: string,
): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (Buffer.isBuffer(first)) return `ad-object-guid:${formatObjectGuid(first)}`;
  const text = firstText(value);
  return text ? `ad-identity:${text}` : `ad-username:${fallbackUsername.toLowerCase()}`;
}

function formatObjectGuid(value: Buffer): string {
  if (value.length !== 16) return value.toString('base64url');
  const hex = (buffer: Buffer) => buffer.toString('hex');
  const first = Buffer.from(value.subarray(0, 4)).reverse();
  const second = Buffer.from(value.subarray(4, 6)).reverse();
  const third = Buffer.from(value.subarray(6, 8)).reverse();
  return `${hex(first)}-${hex(second)}-${hex(third)}-${hex(value.subarray(8, 10))}-${hex(value.subarray(10, 16))}`;
}
