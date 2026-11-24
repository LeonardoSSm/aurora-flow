import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { FormVersionEntity } from './form-version.entity';
import { FormFieldEntity } from './form-field.entity';
import { FormSectionBranchEntity } from './form-section-branch.entity';

@Entity('form_sections')
export class FormSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'form_version_id', type: 'uuid' })
  formVersionId!: string;

  @ManyToOne(() => FormVersionEntity, (version) => version.sections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'form_version_id' })
  formVersion!: FormVersionEntity;

  @Column({ length: 180 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'int' })
  order!: number;

  @Column({ name: 'next_section_id', type: 'uuid', nullable: true })
  nextSectionId!: string | null;

  @ManyToOne(() => FormSectionEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'next_section_id' })
  nextSection!: FormSectionEntity | null;

  @Column({ name: 'next_is_submit', type: 'boolean', default: true })
  nextIsSubmit!: boolean;

  /**
   * Posicao no canvas da aba Fluxo, em pixel. Nula = nunca posicionada a mao;
   * o front calcula a linha reta padrao nesse caso.
   */
  @Column({ name: 'flow_position_x', type: 'real', nullable: true })
  flowPositionX!: number | null;

  @Column({ name: 'flow_position_y', type: 'real', nullable: true })
  flowPositionY!: number | null;

  @OneToMany(() => FormFieldEntity, (field) => field.section, { cascade: ['insert', 'update'] })
  fields!: FormFieldEntity[];

  @OneToMany(() => FormSectionBranchEntity, (branch) => branch.section, {
    cascade: ['insert', 'update'],
  })
  branches!: FormSectionBranchEntity[];
}
