import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormFieldEntity, FormVersionEntity } from '../../../../database/entities';
import { ErpConnectorEntity } from '../../../../database/entities/erp-connector.entity';
import { ErpModule } from '../erp.module';
import { ErpLookupFieldService } from './erp-lookup-field.service';
import { ErpLookupService } from './erp-lookup.service';
import { ErpTableFieldService } from './erp-table-field.service';

/**
 * Campos "Lista do ERP" e "Tabela dinâmica do ERP": consulta no formulário, configuração no
 * construtor e conferência no envio.
 */
@Module({
  imports: [
    ErpModule,
    TypeOrmModule.forFeature([ErpConnectorEntity, FormVersionEntity, FormFieldEntity]),
  ],
  controllers: [],
  providers: [ErpLookupService, ErpLookupFieldService, ErpTableFieldService],
  exports: [ErpLookupFieldService, ErpTableFieldService, ErpLookupService],
})
export class ErpLookupModule {}
