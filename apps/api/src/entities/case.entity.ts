import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CaseStatus, DeceasedInfo, ExecutorInfo } from '@afterlight/shared';
import { UserEntity } from './user.entity';
import { DocumentEntity } from './document.entity';
import { GeneratedDocumentEntity } from './generated-document.entity';

@Entity('cases')
export class CaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: CaseStatus,
    default: CaseStatus.ACTIVE,
  })
  status!: CaseStatus;

  @Column({ type: 'jsonb', nullable: true })
  deceasedInfo!: DeceasedInfo | null;

  @Column({ type: 'jsonb', nullable: true })
  executorInfo!: ExecutorInfo | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => UserEntity, (user) => user.cases)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @OneToMany(() => DocumentEntity, (document) => document.case)
  documents!: DocumentEntity[];

  @OneToMany(() => GeneratedDocumentEntity, (gd) => gd.case)
  generatedDocuments!: GeneratedDocumentEntity[];
}
