import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeLoginName } from './ldap-authentication.service';

@Injectable()
export class EnterpriseIdentityConfigurationService {
  constructor(private readonly config: ConfigService) {}

  normalizeConfiguredUsername(value: string): string {
    return normalizeLoginName(value);
  }

  status() {
    const mode = this.config.get<string>('auth.mode');
    const host = this.config.get<string>('auth.ldap.host');
    const bindDn = this.config.get<string>('auth.ldap.bindDn');
    const searchBase = this.config.get<string>('auth.ldap.searchBase');
    const strategy = this.config.get<string>('auth.ldap.strategy');
    return {
      mode,
      configured:
        mode === 'development' ||
        Boolean(host && searchBase && (strategy === 'DIRECT_BIND' || bindDn)),
      strategy,
      identityAttribute: this.config.get<string>('auth.ldap.identityAttribute'),
      usernameAttribute: this.config.get<string>('auth.ldap.usernameAttribute'),
      displayNameAttribute: this.config.get<string>('auth.ldap.displayNameAttribute'),
      emailAttribute: this.config.get<string>('auth.ldap.emailAttribute'),
      tlsMode: this.config.get<string>('auth.ldap.tlsMode'),
      legacyTlsCompatibility: Boolean(this.config.get<boolean>('auth.ldap.legacyTlsCompatibility')),
      usernameFallbackEnabled: Boolean(this.config.get<boolean>('auth.ldap.allowUsernameFallback')),
    };
  }
}
