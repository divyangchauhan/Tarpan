import { LoggerService } from '@nestjs/common';

/** Nest logger that emits one JSON object per line for log aggregation. */
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context);
  }

  private write(level: string, message: unknown, context?: string, stack?: string): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: typeof message === 'string' ? message : this.stringify(message),
    };
    if (stack) entry.stack = stack;

    const output = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${output}\n`);
    } else {
      process.stdout.write(`${output}\n`);
    }
  }

  private stringify(value: unknown): unknown {
    try {
      return JSON.parse(JSON.stringify(value)) as unknown;
    } catch {
      return String(value);
    }
  }
}
