import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthTokens } from '@tarpan/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { JwtRefreshValidatedUser } from './strategies/jwt-refresh.strategy';
import { JwtValidatedUser } from './strategies/jwt.strategy';

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtValidatedUser;
}

interface RefreshRequest extends ExpressRequest {
  user: JwtRefreshValidatedUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Version('1')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthTokens> {
    return this.authService.register(dto);
  }

  @Version('1')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto);
  }

  @Version('1')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Request() req: RefreshRequest): Promise<AuthTokens> {
    return this.authService.refresh(req.user.userId, req.user.refreshToken);
  }

  @Version('1')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Request() req: AuthenticatedRequest): void {
    this.authService.logout(req.user.userId);
  }
}
