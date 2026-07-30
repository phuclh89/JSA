import { HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
describe('GlobalExceptionFilter', () => {
  it('uses the standard validation response', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const logger = { error: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GlobalExceptionFilter(logger as never).catch(
      new HttpException({ message: ['name must be a string'] }, HttpStatus.BAD_REQUEST),
      host as never,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request data is invalid',
          details: ['name must be a string'],
        },
        correlationId: 'unknown',
      }),
    );
  });
  it('maps Oracle constraint failures without exposing SQL details', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const logger = { error: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GlobalExceptionFilter(logger as never).catch(
      { errorNum: 1, message: 'ORA-00001: unique constraint SECRET_SQL' },
      host as never,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'DATA_CONSTRAINT_VIOLATION',
          message: 'The operation violates a data constraint',
          details: [],
        },
      }),
    );
  });
  it('exposes the internal error message only outside production', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const logger = { error: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GlobalExceptionFilter(logger as never, 'development').catch(
      new Error('ORA-00932: inconsistent datatypes'),
      host as never,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'ORA-00932: inconsistent datatypes',
          details: ['ORA-00932: inconsistent datatypes'],
        },
      }),
    );
  });
  it('keeps unexpected production errors generic', () => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const logger = { error: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new GlobalExceptionFilter(logger as never).catch(
      new Error('sensitive internal failure'),
      host as never,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: [],
        },
      }),
    );
  });
});
