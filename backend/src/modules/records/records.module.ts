import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordReportTemplateEntity, SolicitationEntity } from '../../database/entities';
import { RecordReportTemplatesService } from './record-report-templates.service';
import { RecordsService } from './records.service';

/** Tela Registros (substitui a antiga lista de Respostas de cada processo). Acesso: AccessModule (global). */
@Module({
  imports: [TypeOrmModule.forFeature([SolicitationEntity, RecordReportTemplateEntity])],
  controllers: [],
  providers: [RecordsService, RecordReportTemplatesService],
})
export class RecordsModule {}
