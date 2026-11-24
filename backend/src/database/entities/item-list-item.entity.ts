import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ItemListValues } from '../../modules/item-lists/item-list-columns';
import { ItemListEntity } from './item-list.entity';

/**
 * Um item da lista. O `id` é o valor gravado na resposta (a opção do campo), então renomear o item
 * não perde as respostas antigas; o código é opcional, para quem quiser casar com outro sistema.
 */
@Entity('item_list_items')
@Index('IDX_item_list_items_list', ['listId', 'order'])
export class ItemListItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'list_id', type: 'uuid' })
  listId!: string;

  @ManyToOne(() => ItemListEntity, (list) => list.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'list_id' })
  list!: ItemListEntity;

  @Column({ type: 'varchar', length: 60, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 180 })
  name!: string;

  /** Inativo: sai das opções dos campos; respostas antigas continuam mostrando o nome. */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', default: 0 })
  order!: number;

  /** Valor de cada coluna própria da lista, pelo id da coluna. */
  @Column({ name: 'values_json', type: 'jsonb', default: () => `'{}'::jsonb` })
  valuesJson!: ItemListValues;
}
