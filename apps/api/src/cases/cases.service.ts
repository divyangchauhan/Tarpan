import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CaseEntity } from '../entities/case.entity';
import { S3Service } from '../aws/s3.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    @InjectRepository(CaseEntity)
    private readonly caseRepository: Repository<CaseEntity>,
    private readonly s3Service: S3Service,
    private readonly config: ConfigService,
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
      relations: { generatedDocuments: true },
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
      caseEntity.deceasedInfo = {
        ...(caseEntity.deceasedInfo ?? {}),
        ...patch,
      } as typeof caseEntity.deceasedInfo;
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

  async updateDeceasedInfoByCaseId(
    caseId: string,
    deceasedInfo: Partial<CaseEntity['deceasedInfo'] & object>,
  ): Promise<void> {
    const caseEntity = await this.caseRepository.findOne({ where: { id: caseId } });
    if (!caseEntity) return;
    caseEntity.deceasedInfo = {
      ...(caseEntity.deceasedInfo ?? {}),
      ...deceasedInfo,
    } as CaseEntity['deceasedInfo'];
    await this.caseRepository.save(caseEntity);
    this.logger.log(`Updated deceasedInfo for case ${caseId} from document callback`);
  }

  async remove(userId: string, caseId: string): Promise<void> {
    const caseEntity = await this.findOne(userId, caseId);

    await Promise.all([
      this.s3Service.deletePrefix(
        this.config.getOrThrow<string>('S3_UPLOADS_BUCKET'),
        `cases/${caseId}/`,
      ),
      this.s3Service.deletePrefix(
        this.config.getOrThrow<string>('S3_GENERATED_DOCS_BUCKET'),
        `generated/${caseId}/`,
      ),
    ]);

    await this.caseRepository.remove(caseEntity);
    this.logger.log(`Removed case ${caseId}`);
  }
}
