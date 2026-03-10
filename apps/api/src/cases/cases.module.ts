import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseEntity } from '../entities/case.entity';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CaseEntity])],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
