import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Imagem enviada pela tela para os e-mails do sistema (ex.: arte de fundo do aviso de pontuação).
 * Os bytes ficam no banco, não na pasta de uploads: vão junto no backup e sobrevivem à recriação do
 * container. O e-mail embute a imagem por `cid:email-image-<id>`.
 */
@Entity('email_images')
export class EmailImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 50 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes!: number;

  /** Fora das consultas comuns (só quem precisa dos bytes pede com `addSelect`). */
  @Column({ name: 'content', type: 'bytea', select: false })
  content!: Buffer;

  @Column({ name: 'uploaded_by_user_id', type: 'uuid', nullable: true })
  uploadedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
