import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthTokens, UserRole } from '@afterlight/shared';
import { UserEntity } from '../entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  register(_dto: RegisterDto): Promise<AuthTokens> {
    throw new ForbiddenException('Public registration is disabled. Contact an administrator.');
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isApproved) {
      throw new ForbiddenException('Account not approved. Contact an administrator.');
    }

    this.logger.log(`User logged in: ${user.id}`);
    return this.generateTokens(user.id, user.email, user.role);
  }

  async refresh(userId: string, _refreshToken: string): Promise<AuthTokens> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.logger.log(`Refreshed tokens for user: ${userId}`);
    return this.generateTokens(user.id, user.email, user.role);
  }

  logout(userId: string): void {
    // Stub: stateless JWT — no server-side token storage for POC.
    // Future: invalidate refresh token from a revocation store.
    this.logger.log(`User logged out: ${userId}`);
  }

  generateTokens(userId: string, email: string, role: UserRole): AuthTokens {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
