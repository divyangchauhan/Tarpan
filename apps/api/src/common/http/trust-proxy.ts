import { INestApplication } from '@nestjs/common';

const DEFAULT_TRUSTED_PROXY_HOPS = 2;

export function getTrustedProxyHops(value = process.env['TRUST_PROXY_HOPS']): number {
  const hops = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(hops) && hops >= 0 ? hops : DEFAULT_TRUSTED_PROXY_HOPS;
}

export function configureTrustedProxy(app: INestApplication): void {
  const httpInstance = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: number) => void;
  };
  httpInstance.set('trust proxy', getTrustedProxyHops());
}
