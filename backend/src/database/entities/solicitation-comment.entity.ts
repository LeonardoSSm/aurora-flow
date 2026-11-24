import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SolicitationEntity } from './solicitation.entity';
import { UserEntity } from './user.entity';

@Entity('solicitation_comments')
export class SolicitationCommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'solicitation_id', type: 'uuid' })
  solicitationId!: string;

  @ManyToOne(() => SolicitationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solicitation_id' })
  solicitation!: SolicitationEntity;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'is_internal', type: 'boolean', default: false })
  isInternal!: boolean;

  @Column({ name: 'author_type', type: 'varchar', length: 20 })
  authorType!: 'requester' | 'team';

  @Column({ name: 'author_name', type: 'varchar', length: 150, nullable: true })
  authorName!: string | null;

  @Column({ name: 'author_email', type: 'varchar', length: 255, nullable: true })
  authorEmail!: string | null;

  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_user_id' })
  authorUser!: UserEntity | null;

  @Column({ name: 'proposal_status', type: 'varchar', length: 20, nullable: true })
  proposalStatus!: 'pending' | 'approved' | 'rejected' | null;

  @Column({ name: 'proposal_decided_at', type: 'timestamp', nullable: true })
  proposalDecidedAt!: Date | null;

  @Column({ name: 'proposal_rejection_reason', type: 'text', nullable: true })
  proposalRejectionReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
