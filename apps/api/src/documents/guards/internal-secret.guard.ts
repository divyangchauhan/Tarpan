import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const incomingSecret = request.headers['x-internal-secret'];
    const expectedSecret = this.config.getOrThrow<string>('API_INTERNAL_SECRET');

    if (!incomingSecret || incomingSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal secret');
    }

    return true;
  }
}
