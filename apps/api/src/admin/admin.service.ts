import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@afterlight/shared';
import { UserEntity } from '../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async createUser(dto: CreateUserDto): Promise<{ id: string; email: string }> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role ?? UserRole.USER,
      isApproved: true,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Admin created user: ${saved.id}`);

    return { id: saved.id, email: saved.email };
  }
}
