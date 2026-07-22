import { Global, Module } from '@nestjs/common';
import { DataScopeGuard } from '../../common/auth/data-scope.guard';
import { EnterpriseAuthGuard } from '../../common/auth/enterprise-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { DataScopeService } from './application/data-scope.service';
import { SecurityAuditService } from './application/security-audit.service';
import { UserContextService } from './application/user-context.service';
import { SECURITY_REPOSITORY } from './domain/security.repository';
import { OidcTokenValidator } from './infrastructure/oidc-token-validator';
import { OracleSecurityRepository } from './infrastructure/oracle-security.repository';
import { SequenceRangeValidatorService } from './infrastructure/sequence-range-validator.service';
import { SecurityController } from './security.controller';

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
    OidcTokenValidator,
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
    OidcTokenValidator,
  ],
})
export class SecurityModule {}
