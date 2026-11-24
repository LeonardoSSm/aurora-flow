import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FormEntity } from './form.entity';
import { FormSectionEntity } from './form-section.entity';
import { SubmissionEntity } from './submission.entity';

@Entity('form_versions')
@Index(['formId', 'versionNumber'], { unique: true })
export class FormVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_id', type: 'uuid' })
  formId!: string;

  @ManyToOne(() => FormEntity, (form) => form.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_id' })
  form!: FormEntity;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ name: 'title_display', length: 180 })
  titleDisplay!: string;

  @Column({ name: 'description_display', type: 'text', nullable: true })
  descriptionDisplay!: string | null;

  @Column({ name: 'is_published', default: false })
  isPublished!: boolean;

  @Column({ name: 'published_at', type: 'timestamp with time zone', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'settings_json', type: 'jsonb', default: () => "'{}'" })
  settingsJson!: Record<string, unknown>;

  @OneToMany(() => FormSectionEntity, (section) => section.formVersion, {
    cascade: ['insert', 'update'],
  })
  sections!: FormSectionEntity[];

  @OneToMany(() => SubmissionEntity, (submission) => submission.formVersion)
  submissions!: SubmissionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
