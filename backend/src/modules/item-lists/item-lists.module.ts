import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemListEntity, ItemListItemEntity } from '../../database/entities';
import { ItemListsService } from './item-lists.service';
import { ItemOrderFieldService } from './item-order-field.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemListEntity, ItemListItemEntity])],
  controllers: [],
  providers: [ItemListsService, ItemOrderFieldService],
  exports: [ItemListsService, ItemOrderFieldService],
})
export class ItemListsModule {}
