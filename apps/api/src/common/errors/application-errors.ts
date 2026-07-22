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
