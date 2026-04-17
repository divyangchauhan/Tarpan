import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../entities/user.entity';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
