import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DocumentStatus, DocumentType, ExtractedCertificateData } from '@tarpan/shared';
import { CaseEntity } from './case.entity';
import { ssnJsonbTransformer } from '../common/crypto/ssn-jsonb.transformer';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'case_id' })
  caseId!: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
  })
  type!: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status!: DocumentStatus;

  @Column()
  s3Key!: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: ssnJsonbTransformer<ExtractedCertificateData>(),
  })
  extractedData!: ExtractedCertificateData | null;

  @Column({ type: 'varchar', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => CaseEntity, (caseEntity) => caseEntity.documents)
  @JoinColumn({ name: 'case_id' })
  case!: CaseEntity;
}
