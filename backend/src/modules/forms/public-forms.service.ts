import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import { FormStatus } from '../../common/enums/form-status.enum';
import { FormEntity } from '../../database/entities';
import { toPublicErpLookupSettings } from '../integrations/erp/lookup/erp-lookup.settings';
import { toPublicErpTableSettings } from '../integrations/erp/lookup/erp-table.settings';
import { ItemOrderFieldService } from '../item-lists/item-order-field.service';
import { visibleOptions } from '../item-lists/linked-options';
import { UserEmailFieldService } from '../user-email/user-email-field.service';

export type PublicFormResponse = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  area: string | null;
  status: FormStatus;
  activeVersion: {
    id: string;
    versionNumber: number;
    titleDisplay: string;
    descriptionDisplay: string | null;
    settingsJson: Record<string, unknown>;
    sections: Array<{
      id: string;
      title: string;
      description: string | null;
      order: number;
      nextSectionId: string | null;
      nextIsSubmit: boolean;
      branches: Array<{
        id: string;
        fieldCode: string | null;
        optionValue: string | null;
        checkboxValue: boolean | null;
        targetSectionId: string | null;
        targetIsSubmit: boolean;
      }>;
      fields: Array<{
        id: string;
        code: string;
        label: string;
        fieldType: string;
        required: boolean;
        order: number;
        settingsJson: Record<string, unknown> | null;
        conditionsJson: Record<string, unknown> | null;
        visibilityRules: Record<string, unknown>[] | null;
        options: Array<{ id: string; internalValue: string; displayLabel: string; order: number }>;
      }>;
    }>;
  };
};

@Injectable()
export class PublicFormsService {
  constructor(
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    private readonly itemOrderFields: ItemOrderFieldService,
    private readonly userEmailFields: UserEmailFieldService,
  ) {}

  async findPublicOne(id: string): Promise<PublicFormResponse> {
    const form = await this.formsRepository.findOne({
      where: { id },
      relations: { versions: { sections: { fields: { options: true }, branches: true } } },
      order: {
        versions: {
          versionNumber: 'DESC',
          sections: {
            order: 'ASC',
            fields: { order: 'ASC', options: { order: 'ASC' } },
            branches: { order: 'ASC' },
          },
        },
      },
    });

    if (form?.status !== FormStatus.PUBLISHED)
      throw new NotFoundException('Formulario nao encontrado para visualizacao publica.');

    const publishedVersion =
      [...form.versions]
        .filter((v) => v.isPublished)
        .sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
      [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];

    if (!publishedVersion) throw new NotFoundException('Versao publicada nao encontrada.');

    // "Pedido de itens": os itens da lista vão junto, para pesquisar sem outra chamada.
    const itemOrderSettings = await this.itemOrderFields.publicSettingsByField(
      publishedVersion.sections.flatMap((s) => s.fields),
    );

    // "E-mail de usuário": nome e e-mail das pessoas escolhidas no lugar dos ids.
    const userEmailSettings = await this.userEmailFields.publicSettingsByField(
      publishedVersion.sections.flatMap((s) => s.fields),
    );

    const codeByFieldId = new Map<string, string>();
    const valueByOptionId = new Map<string, string>();
    for (const s of publishedVersion.sections) {
      for (const f of s.fields) {
        codeByFieldId.set(f.id, f.code);
        for (const o of f.options) {
          valueByOptionId.set(o.id, o.internalValue);
        }
      }
    }

    return {
      id: form.id,
      name: form.name,
      description: form.description,
      category: form.category,
      area: form.area,
      status: form.status,
      activeVersion: {
        id: publishedVersion.id,
        versionNumber: publishedVersion.versionNumber,
        titleDisplay: publishedVersion.titleDisplay,
        descriptionDisplay: publishedVersion.descriptionDisplay,
        settingsJson: publishedVersion.settingsJson ?? { mode: 'single' },
        sections: publishedVersion.sections.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          order: s.order,
          nextSectionId: s.nextSectionId,
          nextIsSubmit: s.nextIsSubmit,
          branches: s.branches.map((b) => ({
            id: b.id,
            fieldCode: b.fieldId ? (codeByFieldId.get(b.fieldId) ?? null) : null,
            optionValue: b.optionId ? (valueByOptionId.get(b.optionId) ?? null) : null,
            checkboxValue: b.checkboxValue,
            targetSectionId: b.targetSectionId,
            targetIsSubmit: b.targetIsSubmit,
          })),
          fields: s.fields.map((f) => ({
            id: f.id,
            code: f.code,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required,
            order: f.order,
            // Campos do ERP: o navegador não precisa (nem deve) saber conector, lista e tabela.
            settingsJson:
              f.fieldType === FormFieldType.ERP_LOOKUP
                ? toPublicErpLookupSettings(f.settingsJson)
                : f.fieldType === FormFieldType.ERP_TABLE
                  ? toPublicErpTableSettings(f.settingsJson)
                  : f.fieldType === FormFieldType.ITEM_ORDER
                    ? (itemOrderSettings.get(f.id) ?? {})
                    : f.fieldType === FormFieldType.CALCULATED
                      ? withoutScoreRanges(f.settingsJson)
                      : (userEmailSettings.get(f.id) ?? f.settingsJson),
            conditionsJson: f.conditionsJson,
            visibilityRules: f.visibilityRules,
            // Seleção ligada a uma lista: item desativado ou removido não aparece para escolher.
            options: visibleOptions(f.options, f.settingsJson, (o) => o.internalValue).map((o) => ({
              id: o.id,
              internalValue: o.internalValue,
              displayLabel: o.displayLabel,
              order: o.order,
            })),
          })),
        })),
      },
    };
  }
}

/**
 * Campo calculado: os pontos das opções ficam (o navegador mostra o total enquanto se preenche), mas
 * as faixas (fases para onde o card vai) e o aviso de pontuação (quem recebe: e-mails, usuários) são
 * só do backend — quem responde não precisa, nem deve, vê-los.
 */
function withoutScoreRanges(settings: Record<string, unknown>): Record<string, unknown> {
  if (!settings || !('scoreRanges' in settings || 'scoreAlert' in settings)) return settings;
  const { scoreRanges: _scoreRanges, scoreAlert: _scoreAlert, ...rest } = settings;
  return rest;
}
