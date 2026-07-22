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
});
