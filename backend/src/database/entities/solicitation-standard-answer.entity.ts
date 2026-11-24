import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FormStandardQuestionEntity } from './form-standard-question.entity';
import { SolicitationEntity } from './solicitation.entity';

@Entity('solicitation_standard_answers')
@Index('IDX_ssa_solicitation_id', ['solicitationId'])
@Index('UQ_ssa_solicitation_question', ['solicitationId', 'questionId'], { unique: true })
export class SolicitationStandardAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ name: 'question_id', type: 'uuid', nullable: true })
  questionId!: string | null;

  @ManyToOne(() => FormStandardQuestionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'question_id' })
  question!: FormStandardQuestionEntity | null;

  @Column({ name: 'field_code', type: 'varchar', length: 120 })
  fieldCode!: string;

  @Column({ name: 'value_text', type: 'text', nullable: true })
  valueText!: string | null;

  @Column({ name: 'value_number', type: 'double precision', nullable: true })
  valueNumber!: number | null;

  @Column({ name: 'value_boolean', type: 'boolean', nullable: true })
  valueBoolean!: boolean | null;

  @Column({ name: 'value_json', type: 'jsonb', nullable: true })
  valueJson!: unknown | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
