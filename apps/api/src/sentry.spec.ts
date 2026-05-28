// These jest.mock calls are hoisted before any imports by babel-jest.
jest.mock('@sentry/nestjs', () => ({ init: jest.fn() }));
jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn().mockReturnValue('profiling-integration'),
}));

describe('Sentry instrumentation (instrument.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // After jest.resetModules(), require() re-executes instrument.ts and uses the
  // same mock instance returned by the @sentry/nestjs mock factory.
  function loadAndGetInit(): jest.Mock {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./instrument');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sentry = require('@sentry/nestjs') as { init: jest.Mock };
    return sentry.init;
  }

  it('calls Sentry.init with the DSN from env', () => {
    process.env['SENTRY_DSN'] = 'https://public@sentry.example.com/1';
    process.env['NODE_ENV'] = 'production';

    const initMock = loadAndGetInit();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@sentry.example.com/1',
        environment: 'production',
        sendDefaultPii: false,
      }),
    );
  });

  it('calls Sentry.init with undefined DSN when SENTRY_DSN is not set', () => {
    delete process.env['SENTRY_DSN'];
    process.env['NODE_ENV'] = 'development';

    const initMock = loadAndGetInit();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: undefined,
        environment: 'development',
      }),
    );
  });

  it('sets zero sample rates outside production', () => {
    process.env['NODE_ENV'] = 'test';

    const initMock = loadAndGetInit();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0,
        profilesSampleRate: 0,
      }),
    );
  });

  it('sets non-zero sample rates in production', () => {
    process.env['NODE_ENV'] = 'production';

    const initMock = loadAndGetInit();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.1,
        profilesSampleRate: 0.1,
      }),
    );
  });
});
