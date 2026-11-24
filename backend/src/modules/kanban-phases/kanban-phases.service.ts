import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  FormEntity,
  KanbanPhaseEntity,
  KanbanPhaseFieldEntity,
} from '../../database/entities';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import type { FormKanbanSettings } from '../../database/entities/form.entity';
import { KanbanPhaseInputDto, SaveKanbanPhasesDto } from './dto/save-kanban-phases.dto';
import { SaveKanbanSettingsDto } from './dto/save-kanban-settings.dto';
import { SavePhaseCardVisibilityDto } from './dto/save-phase-card-visibility.dto';
import { normalizeCardVisibility } from './phase-card-visibility';
import { normalizeKanbanSettings } from './kanban-settings';
import { normalizePhaseCalculatedSettings } from './phase-calculations';
import { normalizePhaseVisibility } from './phase-visibility';
import { normalizePhasePeople } from './phase-people';
import type {
  KanbanPhasePeople,
  KanbanPhaseSectionRoute,
} from '../../database/entities/kanban-phase.entity';
import { ItemListsService } from '../item-lists/item-lists.service';
import { ItemOrderFieldService } from '../item-lists/item-order-field.service';
import { normalizePhaseSectionFlow } from './phase-section-flow';

function legacyPeople(roleCode: string | null | undefined): KanbanPhasePeople | null {
  return roleCode ? { roleCodes: [roleCode], userIds: [] } : null;
}

@Injectable()
export class KanbanPhasesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(KanbanPhaseEntity)
    private readonly phasesRepository: Repository<KanbanPhaseEntity>,
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    private readonly itemLists: ItemListsService,
    private readonly itemOrderFields: ItemOrderFieldService,
  ) {}

  async findByForm(formId: string): Promise<KanbanPhaseEntity[]> {
    return this.phasesRepository.find({
      where: { formId },
      relations: { fields: true },
      order: { order: 'ASC', fields: { order: 'ASC' } },
    });
  }

  /**
   * Filtro de cards da fase pela resposta. Grava só esta coluna — o "Salvar fases" do construtor
   * não manda nem apaga o filtro. Regra incompleta (sem valor ou sem pessoa) é descartada.
   */
  async saveCardVisibility(
    formId: string,
    phaseId: string,
    dto: SavePhaseCardVisibilityDto,
  ): Promise<KanbanPhaseEntity> {
    const phase = await this.phasesRepository.findOne({ where: { id: phaseId, formId } });
    if (!phase) throw new NotFoundException('Fase não encontrada neste processo.');
    const incomplete = dto.rules.findIndex(
      (rule) => rule.values.length === 0 || rule.roleCodes.length + rule.userIds.length === 0,
    );
    if (incomplete >= 0) {
      throw new BadRequestException(
        `Regra ${incomplete + 1}: escolha pelo menos um valor e pelo menos um perfil ou usuário.`,
      );
    }
    phase.cardVisibility = normalizeCardVisibility(dto);
    await this.phasesRepository.update(phase.id, { cardVisibility: phase.cardVisibility });
    return phase;
  }

  async save(formId: string, dto: SaveKanbanPhasesDto): Promise<KanbanPhaseEntity[]> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');

    await this.dataSource.transaction((manager) => this.saveInTransaction(manager, formId, dto));

    return this.findByForm(formId);
  }

  /**
   * Substitui as fases do formulário dentro de uma transação de quem chama (a criação de processo
   * pela LOPS IA grava formulário, fases e fluxos juntos). Devolve as fases gravadas, em ordem.
   */
  async saveInTransaction(
    manager: EntityManager,
    formId: string,
    dto: SaveKanbanPhasesDto,
  ): Promise<KanbanPhaseEntity[]> {
    {
      const phaseRepo = manager.getRepository(KanbanPhaseEntity);
      const fieldRepo = manager.getRepository(KanbanPhaseFieldEntity);

      const existingPhases = await phaseRepo.find({
        where: { formId },
        relations: { fields: true },
      });
      const existingPhaseIds = new Set(existingPhases.map((p) => p.id));
      const incomingPhaseIds = new Set(
        dto.phases.filter((p): p is KanbanPhaseInputDto & { id: string } => !!p.id).map((p) => p.id),
      );

      // Delete phases removed from the payload (cascades their fields;
      // SET NULLs any solicitation.currentPhaseId / automation targetPhaseId
      // / phase-field-values pointing at them).
      const phaseIdsToDelete = existingPhases
        .map((p) => p.id)
        .filter((id) => !incomingPhaseIds.has(id));
      if (phaseIdsToDelete.length > 0) {
        await phaseRepo.delete(phaseIdsToDelete);
      }

      for (const phaseInput of dto.phases) {
        // Formato novo (listas) ou, de clientes antigos, o perfil único.
        const actors = normalizePhasePeople(
          phaseInput.actors !== undefined ? phaseInput.actors : legacyPeople(phaseInput.actorRoleCode),
        );
        const approvers = phaseInput.requiresApproval
          ? normalizePhasePeople(
              phaseInput.approvers !== undefined
                ? phaseInput.approvers
                : legacyPeople(phaseInput.approverRoleCode),
            )
          : null;
        if (phaseInput.requiresApproval && !approvers) {
          throw new BadRequestException(
            `A fase "${phaseInput.label}" exige aprovação mas não tem quem aprove (perfil ou usuário).`,
          );
        }

        const existingPhase =
          phaseInput.id && existingPhaseIds.has(phaseInput.id)
            ? existingPhases.find((p) => p.id === phaseInput.id)
            : undefined;

        const savedPhase = await phaseRepo.save({
          id: existingPhase?.id,
          formId,
          key: phaseInput.key,
          label: phaseInput.label,
          color: phaseInput.color ?? 'blue',
          description: phaseInput.description ?? null,
          order: phaseInput.order,
          isTerminal: phaseInput.isTerminal ?? false,
          // Colunas legadas = primeiro perfil, para o app móvel já instalado.
          actorRoleCode: actors?.roleCodes[0] ?? null,
          actors,
          requiresApproval: phaseInput.requiresApproval ?? false,
          approverRoleCode: approvers?.roleCodes[0] ?? null,
          approvers,
          approvalMode: phaseInput.requiresApproval ? (phaseInput.approvalMode ?? 'any') : 'any',
          // Sem aprovação na fase, o que fazer com ela não vale nada e fica no padrão. Cliente que
          // não manda (app móvel, versão antiga) mantém o que estava.
          approvalRequest: phaseInput.requiresApproval
            ? (phaseInput.approvalRequest ?? existingPhase?.approvalRequest ?? 'manual')
            : 'manual',
          approvalOnApproved: phaseInput.requiresApproval
            ? (phaseInput.approvalOnApproved ?? existingPhase?.approvalOnApproved ?? 'stay')
            : 'stay',
          approvalOnRejected: phaseInput.requiresApproval
            ? (phaseInput.approvalOnRejected ?? existingPhase?.approvalOnRejected ?? 'stay')
            : 'stay',
          // Cliente que não conhece a opção (app móvel, versão antiga) mantém o que estava.
          requireFieldsToExit:
            phaseInput.requireFieldsToExit ?? existingPhase?.requireFieldsToExit ?? false,
          requireAssigneeToExit:
            phaseInput.requireAssigneeToExit ?? existingPhase?.requireAssigneeToExit ?? false,
          blockMoveBack: phaseInput.blockMoveBack ?? existingPhase?.blockMoveBack ?? false,
          visibleTo: normalizePhaseVisibility(phaseInput.visibleTo),
          // Prazo da fase: sem horas, as outras opções não valem nada e ficam no padrão.
          slaHours: phaseInput.slaHours ?? null,
          slaBusinessHours: phaseInput.slaHours ? (phaseInput.slaBusinessHours ?? false) : false,
          slaWarningPercent: phaseInput.slaHours ? (phaseInput.slaWarningPercent ?? null) : null,
        });

        const existingFieldIds = new Set((existingPhase?.fields ?? []).map((f) => f.id));
        const incomingFieldIds = new Set(
          phaseInput.fields.filter((f) => !!f.id).map((f) => f.id as string),
        );
        const fieldIdsToDelete = [...existingFieldIds].filter((id) => !incomingFieldIds.has(id));
        if (fieldIdsToDelete.length > 0) {
          await fieldRepo.delete(fieldIdsToDelete);
        }

        await this.itemOrderFields.assertPhaseFieldsReady(manager, phaseInput.label, phaseInput.fields);

        const savedFields: KanbanPhaseFieldEntity[] = [];
        for (const fieldInput of phaseInput.fields) {
          let settingsJson = fieldInput.settingsJson ?? null;
          if (fieldInput.fieldType === FormFieldType.CALCULATED) {
            try {
              settingsJson = normalizePhaseCalculatedSettings(fieldInput.label, settingsJson);
            } catch (error) {
              throw new BadRequestException(`Fase "${phaseInput.label}": ${(error as Error).message}`);
            }
          }
          // Seleção ligada a uma lista de itens: as opções vêm da lista como ela está agora.
          const linked = await this.itemLists.syncPhaseFieldInput(
            manager,
            fieldInput.fieldType,
            settingsJson,
            fieldInput.options ?? null,
          );
          const savedField = await fieldRepo.save({
            id: fieldInput.id && existingFieldIds.has(fieldInput.id) ? fieldInput.id : undefined,
            phaseId: savedPhase.id,
            code: fieldInput.code,
            label: fieldInput.label,
            fieldType: fieldInput.fieldType,
            required: fieldInput.required ?? false,
            order: fieldInput.order,
            settingsJson: linked?.settings ?? settingsJson,
            optionsJson: linked?.options ?? fieldInput.options ?? null,
          });
          savedFields.push(savedField);
        }

        // Caminho entre as seções do formulário da fase, conferido contra os campos como ficaram
        // (opções de lista já atualizadas). Referência que não existe recusa o salvamento inteiro.
        // Cliente que não conhece o caminho (não manda `sectionFlow`) mantém o que estava, se
        // ainda casar com os campos.
        let sectionFlow: KanbanPhaseSectionRoute[] | null;
        if (phaseInput.sectionFlow === undefined) {
          try {
            sectionFlow = normalizePhaseSectionFlow(existingPhase?.sectionFlow ?? null, savedFields);
          } catch {
            sectionFlow = null;
          }
        } else {
          try {
            sectionFlow = normalizePhaseSectionFlow(phaseInput.sectionFlow, savedFields);
          } catch (error) {
            throw new BadRequestException(
              `Fase "${phaseInput.label}", formulário: ${(error as Error).message}`,
            );
          }
        }
        await phaseRepo.update(savedPhase.id, { sectionFlow });
      }
    }

    return manager.getRepository(KanbanPhaseEntity).find({
      where: { formId },
      relations: { fields: true },
      order: { order: 'ASC', fields: { order: 'ASC' } },
    });
  }

  async getSettings(formId: string): Promise<FormKanbanSettings> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    return normalizeKanbanSettings(form.kanbanSettings);
  }

  async saveSettings(formId: string, dto: SaveKanbanSettingsDto): Promise<FormKanbanSettings> {
    const form = await this.formsRepository.findOne({ where: { id: formId } });
    if (!form) throw new NotFoundException('Formulario nao encontrado.');
    const settings = normalizeKanbanSettings({
      ...normalizeKanbanSettings(form.kanbanSettings),
      ...(dto.cardValueField !== undefined ? { cardValueField: dto.cardValueField } : {}),
    });
    await this.formsRepository.update(formId, { kanbanSettings: settings });
    return settings;
  }
}
