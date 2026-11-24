import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { FormVersionEntity } from './form-version.entity';

@Entity('submission_progress')
export class SubmissionProgressEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ name: 'form_version_id', type: 'uuid' })
  formVersionId!: string;

  @ManyToOne(() => FormVersionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_version_id' })
  formVersion!: FormVersionEntity;

  @Column({ name: 'answers_json', type: 'jsonb', default: () => "'{}'" })
  answersJson!: Record<string, string>;

  @Column({ name: 'visited_section_ids', type: 'jsonb', default: () => "'[]'" })
  visitedSectionIds!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
