import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Must be imported before any other modules to ensure correct instrumentation.
// SENTRY_DSN env var controls whether Sentry is active; omit or leave empty to disable.
Sentry.init({
  dsn: process.env['SENTRY_DSN'],
  environment: process.env['NODE_ENV'] ?? 'development',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 0,
  profilesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 0,
  // Never send PII (names, emails, IPs) automatically.
  sendDefaultPii: false,
});
