import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('registers the throttler guard globally', () => {
    const providers = Reflect.getMetadata('providers', AppModule) as unknown[];

    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: ThrottlerGuard });
  });
});
