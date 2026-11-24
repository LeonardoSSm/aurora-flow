import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AreasModule } from '../areas/areas.module';
import {
  DashboardEntity,
  DashboardWidgetEntity,
  FormEntity,
  FormVersionEntity,
  SolicitationEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { DashboardsService } from './dashboards.service';
import { PaineisLivresService } from './paineis-livres.service';
import { SolicitacaoQueryService } from './solicitacao-query.service';
import { WidgetQueryService } from './widget-query.service';

/**
 * Construtor de dashboards, em dois recursos que dividem o mesmo motor.
 *
 * Dois motores traduzem configuracao em consulta agregada, um por fonte:
 * `WidgetQueryService` sobre respostas de formulario e `SolicitacaoQueryService`
 * sobre solicitacoes — separados porque a regra de acesso de cada fonte e
 * diferente. Sobre eles:
 *
 * - `DashboardsService` — o painel do formulario, um por formulario, na aba
 *   Analytics do builder.
 * - `PaineisLivresService` — paineis que cruzam formularios, pertencem a uma
 *   pessoa e so aparecem para os outros depois de publicados.
 *
 * Os dois calculam os blocos ao vivo a cada leitura, sem cache — decisao
 * registrada no estudo de viabilidade.
 */
@Module({
  imports: [
    // RolesModule e @Global(): PermissionsService ja chega por injecao.
    AreasModule,
    TypeOrmModule.forFeature([
      DashboardEntity,
      DashboardWidgetEntity,
      FormEntity,
      FormVersionEntity,
      SolicitationEntity,
      SubmissionEntity,
      UserEntity,
    ]),
  ],
  controllers: [],
  providers: [
    WidgetQueryService,
    SolicitacaoQueryService,
    DashboardsService,
    PaineisLivresService,
  ],
  exports: [
    WidgetQueryService,
    SolicitacaoQueryService,
    DashboardsService,
    PaineisLivresService,
  ],
})
export class DashboardsModule {}
