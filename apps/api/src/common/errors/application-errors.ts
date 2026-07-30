import { HttpException, HttpStatus } from '@nestjs/common';

export class ApplicationError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
    public readonly details: unknown[] = [],
  ) {
    super(message, status);
  }
}
export class UnauthenticatedError extends ApplicationError {
  constructor() {
    super('UNAUTHENTICATED', 'Authentication is required', HttpStatus.UNAUTHORIZED);
  }
}
export class InvalidEnterpriseCredentialsError extends ApplicationError {
  constructor() {
    super(
      'INVALID_ENTERPRISE_CREDENTIALS',
      'The username or password is incorrect',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
export class EnterpriseAuthenticationUnavailableError extends ApplicationError {
  constructor() {
    super(
      'ENTERPRISE_AUTHENTICATION_UNAVAILABLE',
      'Enterprise authentication is temporarily unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
export class AccessDeniedError extends ApplicationError {
  constructor() {
    super('ACCESS_DENIED', 'Access is denied', HttpStatus.FORBIDDEN);
  }
}
export class UnauthorizedError extends AccessDeniedError {}
export class ApplicationUserNotRegisteredError extends ApplicationError {
  constructor() {
    super(
      'APPLICATION_USER_NOT_REGISTERED',
      'Application access is not registered',
      HttpStatus.FORBIDDEN,
    );
  }
}
export class ApplicationUserInactiveError extends ApplicationError {
  constructor() {
    super('APPLICATION_USER_INACTIVE', 'Application access is inactive', HttpStatus.FORBIDDEN);
  }
}
export class ConflictingIdentityMappingError extends ApplicationError {
  constructor() {
    super(
      'CONFLICTING_IDENTITY_MAPPING',
      'The enterprise identity mapping conflicts with another application user',
      HttpStatus.FORBIDDEN,
    );
  }
}
export class PendingWorkflowImpactError extends ApplicationError {
  constructor(details: unknown[]) {
    super(
      'PENDING_WORKFLOW_IMPACT',
      'The change would leave one or more pending workflow tasks without an authorized assignee',
      HttpStatus.CONFLICT,
      details,
    );
  }
}
export class DataScopeDeniedError extends ApplicationError {
  constructor() {
    super(
      'DATA_SCOPE_DENIED',
      'Access is denied for the requested data scope',
      HttpStatus.FORBIDDEN,
    );
  }
}
export class ValidationError extends ApplicationError {
  constructor(message = 'Request data is invalid', details: unknown[] = []) {
    super('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}
export class DuplicateConflictError extends ApplicationError {
  constructor(message = 'A conflicting record already exists') {
    super('DUPLICATE_CONFLICT', message, HttpStatus.CONFLICT);
  }
}
export class OracleConstraintError extends ApplicationError {
  constructor(message = 'The operation violates a data constraint') {
    super('DATA_CONSTRAINT_VIOLATION', message, HttpStatus.CONFLICT);
  }
}
export class ResourceNotFoundError extends ApplicationError {
  constructor(message = 'Resource was not found') {
    super('RESOURCE_NOT_FOUND', message, HttpStatus.NOT_FOUND);
  }
}
export class StateConflictError extends ApplicationError {
  constructor(message = 'Resource state conflicts with this operation') {
    super('STATE_CONFLICT', message, HttpStatus.CONFLICT);
  }
}
export class OptimisticLockError extends ApplicationError {
  constructor() {
    super(
      'OPTIMISTIC_LOCK_CONFLICT',
      'Resource was changed by another request',
      HttpStatus.CONFLICT,
    );
  }
}
export class OracleUnavailableError extends ApplicationError {
  constructor() {
    super(
      'ORACLE_UNAVAILABLE',
      'A required dependency is unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
export class MatrixIncompleteError extends ApplicationError {
  constructor(details: unknown[] = []) {
    super(
      'MATRIX_VERSION_INCOMPLETE',
      'The Matrix Version is incomplete',
      HttpStatus.CONFLICT,
      details,
    );
  }
}
export class OverlappingAssignmentError extends ApplicationError {
  constructor(details: unknown[] = []) {
    super(
      'RIG_MATRIX_ASSIGNMENT_OVERLAP',
      'The assignment overlaps an existing Rig Matrix assignment',
      HttpStatus.CONFLICT,
      details,
    );
  }
}
export class NoEffectiveMatrixError extends ApplicationError {
  constructor() {
    super(
      'NO_EFFECTIVE_MATRIX',
      'No effective Matrix Version is configured for this rig and time',
      HttpStatus.NOT_FOUND,
    );
  }
}
export class MultipleEffectiveMatricesError extends ApplicationError {
  constructor() {
    super(
      'MULTIPLE_EFFECTIVE_MATRICES',
      'Multiple effective Matrix Versions were detected',
      HttpStatus.CONFLICT,
    );
  }
}
