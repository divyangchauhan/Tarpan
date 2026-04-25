import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseEntity } from '../entities/case.entity';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    @InjectRepository(CaseEntity)
    private readonly caseRepository: Repository<CaseEntity>,
  ) {}

  async create(userId: string, dto: CreateCaseDto): Promise<CaseEntity> {
    const caseEntity = this.caseRepository.create({
      userId,
      deceasedInfo: dto.deceasedInfo ?? null,
      executorInfo: dto.executorInfo,
    });

    const saved = await this.caseRepository.save(caseEntity);
    this.logger.log(`Created case ${saved.id} for user ${userId}`);
    return saved;
  }

  async findAll(userId: string): Promise<CaseEntity[]> {
    return this.caseRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, caseId: string): Promise<CaseEntity> {
    const caseEntity = await this.caseRepository.findOne({
      where: { id: caseId, userId },
    });

    if (!caseEntity) {
      throw new NotFoundException(`Case ${caseId} not found`);
    }

    return caseEntity;
  }

  async update(userId: string, caseId: string, dto: UpdateCaseDto): Promise<CaseEntity> {
    const caseEntity = await this.findOne(userId, caseId);

    if (dto.status !== undefined) {
      caseEntity.status = dto.status;
    }

    if (dto.deceasedInfo !== undefined) {
      const patch = Object.fromEntries(
        Object.entries(dto.deceasedInfo).filter(([, v]) => v !== undefined),
      );
      caseEntity.deceasedInfo = { ...(caseEntity.deceasedInfo ?? {}), ...patch } as typeof caseEntity.deceasedInfo;
    }

    if (dto.executorInfo !== undefined) {
      const patch = Object.fromEntries(
        Object.entries(dto.executorInfo).filter(([, v]) => v !== undefined),
      );
      caseEntity.executorInfo = {
        ...(caseEntity.executorInfo ?? {}),
        ...patch,
      } as typeof caseEntity.executorInfo;
    }

    const updated = await this.caseRepository.save(caseEntity);
    this.logger.log(`Updated case ${caseId}`);
    return updated;
  }

  async remove(userId: string, caseId: string): Promise<void> {
    const caseEntity = await this.findOne(userId, caseId);
    await this.caseRepository.remove(caseEntity);
    this.logger.log(`Removed case ${caseId}`);
  }
}
