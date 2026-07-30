import { startupDiagnosticHint, startupErrorMessage } from '../src/main';

describe('API startup diagnostics', () => {
  it('reports an occupied API port without blaming Oracle', () => {
    const error = Object.assign(new Error('listen EADDRINUSE: address already in use :::3000'), {
      code: 'EADDRINUSE',
    });

    expect(startupErrorMessage(error)).toContain('EADDRINUSE');
    expect(startupDiagnosticHint(error)).toContain('API port is already in use');
    expect(startupDiagnosticHint(error)).not.toContain('Oracle');
  });
});
