import { Global, Module } from '@nestjs/common';
import { DataScopeGuard } from '../../common/auth/data-scope.guard';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { DataScopeService } from './application/data-scope.service';
import { SecurityAuditService } from './application/security-audit.service';
import { UserContextService } from './application/user-context.service';
import { SECURITY_REPOSITORY } from './domain/security.repository';
import { OracleSecurityRepository } from './infrastructure/oracle-security.repository';
import { SequenceRangeValidatorService } from './infrastructure/sequence-range-validator.service';
import { SecurityController } from './security.controller';
import { AuthSessionService } from './application/auth-session.service';
import { LdapAuthenticationService } from './application/ldap-authentication.service';
import { EnterpriseIdentityConfigurationService } from './application/enterprise-identity-configuration.service';

@Global()
@Module({
  controllers: [SecurityController],
  providers: [
    UserContextService,
    DataScopeService,
    SecurityAuditService,
    EnterpriseAuthGuard,
    PermissionGuard,
    DataScopeGuard,
    AuthSessionService,
    LdapAuthenticationService,
    EnterpriseIdentityConfigurationService,
    OracleSecurityRepository,
    SequenceRangeValidatorService,
    { provide: SECURITY_REPOSITORY, useExisting: OracleSecurityRepository },
  ],
  exports: [
    UserContextService,
    DataScopeService,
    SecurityAuditService,
    EnterpriseAuthGuard,
    PermissionGuard,
    DataScopeGuard,
    AuthSessionService,
    LdapAuthenticationService,
    EnterpriseIdentityConfigurationService,
    SECURITY_REPOSITORY,
  ],
})
export class SecurityModule {}
