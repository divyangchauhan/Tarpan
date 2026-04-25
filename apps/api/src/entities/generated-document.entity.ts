import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GeneratedDocumentStatus, InstitutionType } from '@afterlight/shared';
import { CaseEntity } from './case.entity';
import { DocumentEntity } from './document.entity';

@Entity('generated_documents')
export class GeneratedDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'case_id' })
  caseId!: string;

  @Column({ name: 'document_id' })
  documentId!: string;

  @Column({
    type: 'enum',
    enum: InstitutionType,
  })
  institutionType!: InstitutionType;

  @Column({ type: 'varchar', nullable: true })
  institutionName!: string | null;

  @Column({
    type: 'enum',
    enum: GeneratedDocumentStatus,
    default: GeneratedDocumentStatus.PENDING,
  })
  status!: GeneratedDocumentStatus;

  @Column({ type: 'varchar', nullable: true })
  s3Key!: string | null;

  @Column({ type: 'varchar', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => CaseEntity, (caseEntity) => caseEntity.generatedDocuments)
  @JoinColumn({ name: 'case_id' })
  case!: CaseEntity;

  @ManyToOne(() => DocumentEntity)
  @JoinColumn({ name: 'document_id' })
  document!: DocumentEntity;
}
