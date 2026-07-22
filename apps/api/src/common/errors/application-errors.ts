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
export class UnauthorizedError extends ApplicationError {
  constructor() {
    super('UNAUTHORIZED', 'Permission is required', HttpStatus.FORBIDDEN);
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
