import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ItemListColumn } from '../../modules/item-lists/item-list-columns';
import { ItemListItemEntity } from './item-list-item.entity';

/**
 * Lista de itens reutilizável: os itens são cadastrados uma vez e viram as opções dos campos de
 * seleção (lista suspensa, seleção única e múltipla) ligados a ela, em formulários e fases. Mudar a
 * lista atualiza esses campos; respostas já enviadas continuam mostrando o item escolhido.
 */
@Entity('item_lists')
export class ItemListEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Colunas próprias da lista (além de código e nome) — ver `item-list-columns.ts`. */
  @Column({ name: 'columns_json', type: 'jsonb', default: () => `'[]'::jsonb` })
  columnsJson!: ItemListColumn[];

  /** Arquivada: some da escolha em campos novos; os campos que já usam continuam funcionando. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @OneToMany(() => ItemListItemEntity, (item) => item.list)
  items!: ItemListItemEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
