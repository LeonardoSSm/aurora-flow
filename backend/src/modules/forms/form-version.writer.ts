import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import {
  FormEntity,
  FormFieldEntity,
  FormFieldOptionEntity,
  FormSectionBranchEntity,
  FormSectionEntity,
  FormVersionEntity,
} from '../../database/entities';
import type { CreateFormDto, CreateFormSectionDto } from './dto/create-form.dto';

type NormalizedBranch = {
  fieldCode: string | null;
  optionValue: string | null;
  checkboxValue: boolean | null;
  targetOrder: number | null | 'ORPHANED';
};

type NormalizedSection = {
  title: string;
  description: string | null;
  nextOrder: number | null | 'ORPHANED';
  fields: Array<{
    code: string;
    label: string;
    type: string;
    required: boolean;
    isSensitive: boolean;
    settingsJson: Record<string, unknown>;
    conditionsJson: Record<string, unknown>;
    visibilityRules: unknown;
    options: string[];
  }>;
  branches: NormalizedBranch[];
};

function sortBranches(branches: NormalizedBranch[]): NormalizedBranch[] {
  const key = (b: NormalizedBranch): string =>
    `${b.fieldCode ?? ''}:${b.optionValue ?? ''}:${String(b.checkboxValue)}`;
  return [...branches].sort((a, b) => key(a).localeCompare(key(b)));
}

/**
 * Ordena as chaves de todo objeto, recursivamente, antes do hash.
 *
 * `JSON.stringify` é sensível à ordem das chaves — mas o Postgres `jsonb` não
 * preserva a ordem que recebeu: reordena por tamanho da chave e depois
 * alfabeticamente. Um `settingsJson` que acabou de vir do front (na ordem que
 * o objeto JS foi montado) e o mesmo valor lido de volta de uma coluna
 * `jsonb` quase sempre viram strings diferentes, mesmo sendo o objeto
 * idêntico — foi isso que fazia todo salvamento recriar a versão inteira,
 * mesmo sem nenhuma mudança real. Sem essa normalização, comparar por
 * `JSON.stringify` cru não é seguro para nada que passou por uma coluna
 * `jsonb`.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function dtoStructureHash(dto: CreateFormDto): string {
  const dtoSectionOrder = (index: number | null | undefined): number | null =>
    index === null || index === undefined ? null : index + 1;

  const normalized: NormalizedSection[] = dto.sections.map((s: CreateFormSectionDto) => ({
    title: s.title,
    description: s.description ?? null,
    nextOrder: dtoSectionOrder(s.nextSectionIndex),
    fields: s.fields.map((f) => ({
      code: f.code,
      label: f.label,
      type: f.fieldType,
      required: f.required,
      isSensitive: f.isSensitive ?? false,
      settingsJson: f.settingsJson ?? {},
      conditionsJson: f.conditionsJson ?? {},
      visibilityRules: f.visibilityRules ?? null,
      options: (f.options ?? []).map((o) => o.internalValue).sort(),
    })),
    branches: sortBranches(
      (s.branches ?? []).map((b) => ({
        fieldCode: b.fieldCode,
        optionValue: b.optionValue ?? null,
        checkboxValue: b.checkboxValue ?? null,
        targetOrder: dtoSectionOrder(b.targetSectionIndex),
      })),
    ),
  }));
  return createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
}

function versionStructureHash(version: FormVersionEntity): string {
  const sections = [...(version.sections ?? [])].sort((a, b) => a.order - b.order);
  const orderBySectionId = new Map(sections.map((s) => [s.id, s.order]));
  const codeByFieldId = new Map<string, string>();
  const valueByOptionId = new Map<string, string>();
  for (const s of sections) {
    for (const f of s.fields ?? []) {
      codeByFieldId.set(f.id, f.code);
      for (const o of f.options ?? []) {
        valueByOptionId.set(o.id, o.internalValue);
      }
    }
  }

  const resolveTargetOrder = (
    targetSectionId: string | null,
    isSubmit: boolean,
  ): number | 'ORPHANED' | null => {
    // Anything other than an explicit `false` is treated as "submit" — this is the
    // column's DB default and keeps legacy rows without a real target from being
    // misreported as orphaned.
    if (isSubmit !== false) return null;
    if (!targetSectionId) return 'ORPHANED';
    return orderBySectionId.get(targetSectionId) ?? 'ORPHANED';
  };

  const normalized: NormalizedSection[] = sections.map((s) => ({
    title: s.title,
    description: s.description ?? null,
    nextOrder: resolveTargetOrder(s.nextSectionId, s.nextIsSubmit),
    fields: [...(s.fields ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((f) => ({
        code: f.code,
        label: f.label,
        type: f.fieldType,
        required: f.required,
        isSensitive: f.isSensitive ?? false,
        settingsJson: f.settingsJson ?? {},
        conditionsJson: f.conditionsJson ?? {},
        visibilityRules: f.visibilityRules ?? null,
        options: (f.options ?? []).map((o) => o.internalValue).sort(),
      })),
    branches: sortBranches(
      (s.branches ?? []).map((b) => ({
        fieldCode: b.fieldId ? (codeByFieldId.get(b.fieldId) ?? 'ORPHANED') : null,
        optionValue: b.optionId ? (valueByOptionId.get(b.optionId) ?? 'ORPHANED') : null,
        checkboxValue: b.checkboxValue,
        targetOrder: resolveTargetOrder(b.targetSectionId, b.targetIsSubmit),
      })),
    ),
  }));
  return createHash('sha256').update(JSON.stringify(canonicalize(normalized))).digest('hex');
}

@Injectable()
export class FormVersionWriter {
  async createVersionFromDto(
    manager: EntityManager,
    formId: string,
    versionNumber: number,
    dto: CreateFormDto,
  ): Promise<FormVersionEntity> {
    const version = await manager.save(
      manager.create(FormVersionEntity, {
        formId,
        versionNumber,
        titleDisplay: dto.name,
        descriptionDisplay: dto.description ?? null,
        settingsJson: dto.settingsJson ? { ...dto.settingsJson } : { mode: 'single' },
      }),
    );

    const sectionEntities: FormSectionEntity[] = [];
    const fieldIdByCode = new Map<string, string>();
    const optionIdByFieldAndValue = new Map<string, string>();

    for (let si = 0; si < dto.sections.length; si++) {
      const sIn = dto.sections[si];
      const section = await manager.save(
        manager.create(FormSectionEntity, {
          formVersionId: version.id,
          title: sIn.title,
          description: sIn.description ?? null,
          order: si + 1,
          flowPositionX: sIn.flowPositionX ?? null,
          flowPositionY: sIn.flowPositionY ?? null,
        }),
      );
      sectionEntities.push(section);

      for (let fi = 0; fi < sIn.fields.length; fi++) {
        const fIn = sIn.fields[fi];
        const field = await manager.save(
          manager.create(FormFieldEntity, {
            formVersionId: version.id,
            sectionId: section.id,
            code: fIn.code,
            label: fIn.label,
            fieldType: fIn.fieldType,
            order: fi + 1,
            required: fIn.required,
            isSensitive: fIn.isSensitive ?? false,
            settingsJson: fIn.settingsJson ?? {},
            conditionsJson: fIn.conditionsJson ?? {},
            visibilityRules: fIn.visibilityRules ?? null,
          }),
        );
        fieldIdByCode.set(fIn.code, field.id);

        if (fIn.options?.length) {
          const savedOptions = await manager.save(
            fIn.options.map((o, oi) =>
              manager.create(FormFieldOptionEntity, {
                fieldId: field.id,
                internalValue: o.internalValue,
                displayLabel: o.displayLabel,
                order: oi + 1,
              }),
            ),
          );
          savedOptions.forEach((o) =>
            optionIdByFieldAndValue.set(`${field.id}:${o.internalValue}`, o.id),
          );
        }
      }
    }

    await this.resolveFlowReferences(manager, dto.sections, sectionEntities, {
      fieldIdByCode,
      optionIdByFieldAndValue,
    });

    return version;
  }

  private async resolveFlowReferences(
    manager: EntityManager,
    sectionDtos: CreateFormSectionDto[],
    sectionEntities: FormSectionEntity[],
    lookup: { fieldIdByCode: Map<string, string>; optionIdByFieldAndValue: Map<string, string> },
  ): Promise<void> {
    for (let si = 0; si < sectionDtos.length; si++) {
      const sIn = sectionDtos[si];
      const section = sectionEntities[si];
      const nextIndex = sIn.nextSectionIndex ?? null;
      const nextSectionId = nextIndex !== null ? (sectionEntities[nextIndex]?.id ?? null) : null;

      await manager.update(
        FormSectionEntity,
        { id: section.id },
        { nextSectionId, nextIsSubmit: nextIndex === null },
      );

      if (sIn.branches?.length) {
        const branchEntities = sIn.branches.map((b, bi) => {
          const fieldId = lookup.fieldIdByCode.get(b.fieldCode) ?? null;
          const optionId =
            b.optionValue !== undefined && fieldId
              ? (lookup.optionIdByFieldAndValue.get(`${fieldId}:${b.optionValue}`) ?? null)
              : null;
          const targetIndex = b.targetSectionIndex ?? null;
          const targetSectionId =
            targetIndex !== null ? (sectionEntities[targetIndex]?.id ?? null) : null;

          return manager.create(FormSectionBranchEntity, {
            sectionId: section.id,
            fieldId,
            optionId,
            checkboxValue: b.checkboxValue ?? null,
            targetSectionId,
            targetIsSubmit: targetIndex === null,
            order: bi + 1,
          });
        });
        await manager.save(branchEntities);
      }
    }
  }

  async copyVersionStructure(
    manager: EntityManager,
    sourceVersion: FormVersionEntity,
    targetFormId: string,
  ): Promise<void> {
    const version = await manager.save(
      manager.create(FormVersionEntity, {
        formId: targetFormId,
        versionNumber: 1,
        titleDisplay: sourceVersion.titleDisplay,
        descriptionDisplay: sourceVersion.descriptionDisplay,
        settingsJson: sourceVersion.settingsJson ?? { mode: 'single' },
      }),
    );

    const sourceSections = [...sourceVersion.sections].sort((a, b) => a.order - b.order);
    const newSectionBySourceId = new Map<string, FormSectionEntity>();
    const newFieldIdBySourceId = new Map<string, string>();
    const newOptionIdBySourceId = new Map<string, string>();

    for (const ss of sourceSections) {
      const section = await manager.save(
        manager.create(FormSectionEntity, {
          formVersionId: version.id,
          title: ss.title,
          description: ss.description,
          order: ss.order,
        }),
      );
      newSectionBySourceId.set(ss.id, section);

      for (const sf of ss.fields) {
        const field = await manager.save(
          manager.create(FormFieldEntity, {
            formVersionId: version.id,
            sectionId: section.id,
            code: sf.code,
            label: sf.label,
            fieldType: sf.fieldType,
            order: sf.order,
            required: sf.required,
            isSensitive: sf.isSensitive ?? false,
            settingsJson: sf.settingsJson ?? {},
            conditionsJson: sf.conditionsJson ?? {},
            visibilityRules: sf.visibilityRules ?? null,
          }),
        );
        newFieldIdBySourceId.set(sf.id, field.id);

        if (sf.options?.length) {
          const savedOptions = await manager.save(
            sf.options.map((o) =>
              manager.create(FormFieldOptionEntity, {
                fieldId: field.id,
                internalValue: o.internalValue,
                displayLabel: o.displayLabel,
                order: o.order,
              }),
            ),
          );
          sf.options.forEach((o, oi) => newOptionIdBySourceId.set(o.id, savedOptions[oi].id));
        }
      }
    }

    for (const ss of sourceSections) {
      const newSection = newSectionBySourceId.get(ss.id);
      if (!newSection) continue;

      const nextSectionId = ss.nextSectionId
        ? (newSectionBySourceId.get(ss.nextSectionId)?.id ?? null)
        : null;
      await manager.update(
        FormSectionEntity,
        { id: newSection.id },
        { nextSectionId, nextIsSubmit: ss.nextIsSubmit },
      );

      if (ss.branches?.length) {
        const branchEntities = ss.branches.map((b) =>
          manager.create(FormSectionBranchEntity, {
            sectionId: newSection.id,
            fieldId: b.fieldId ? (newFieldIdBySourceId.get(b.fieldId) ?? null) : null,
            optionId: b.optionId ? (newOptionIdBySourceId.get(b.optionId) ?? null) : null,
            checkboxValue: b.checkboxValue,
            targetSectionId: b.targetSectionId
              ? (newSectionBySourceId.get(b.targetSectionId)?.id ?? null)
              : null,
            targetIsSubmit: b.targetIsSubmit,
            order: b.order,
          }),
        );
        await manager.save(branchEntities);
      }
    }
  }

  async applyVersionUpdate(
    manager: EntityManager,
    form: FormEntity,
    dto: CreateFormDto,
  ): Promise<void> {
    const latestStub = [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];

    if (!latestStub) {
      await this.createVersionFromDto(manager, form.id, 1, dto);
      return;
    }

    const latestVersion = await manager.findOne(FormVersionEntity, {
      where: { id: latestStub.id },
      relations: { sections: { fields: { options: true }, branches: true } },
    });

    if (!latestVersion) {
      await this.createVersionFromDto(manager, form.id, 1, dto);
      return;
    }

    const incomingHash = dtoStructureHash(dto);
    const existingHash = versionStructureHash(latestVersion);

    if (incomingHash === existingHash) {
      // Sem mudança de estrutura — mas a posição no canvas do fluxo e as configurações da
      // versão (modo do formulário, identificação opcional...) não entram no hash de
      // propósito (não são estrutura), então são os únicos casos em que ainda precisa
      // gravar algo: senão organizar as seções, ou só trocar uma configuração, nunca
      // persistiria, mesmo a pessoa clicando em Salvar.
      await this.syncFlowPositions(manager, latestVersion, dto);
      await this.syncVersionSettings(manager, latestVersion, dto);
      return;
    }

    if (!latestVersion.isPublished) {
      await manager.delete(FormVersionEntity, { id: latestVersion.id });
      await this.createVersionFromDto(manager, form.id, latestVersion.versionNumber, dto);
    } else {
      await this.createVersionFromDto(manager, form.id, latestVersion.versionNumber + 1, dto);
    }
  }

  /**
   * Grava só a posição no canvas, sem tocar em mais nada da versão.
   *
   * Chamado quando o hash de estrutura não mudou — o pareamento por índice é
   * seguro exatamente por isso: hash igual implica mesma contagem e mesma
   * ordem de seção entre o que chegou e o que já estava salvo.
   */
  private async syncFlowPositions(
    manager: EntityManager,
    version: FormVersionEntity,
    dto: CreateFormDto,
  ): Promise<void> {
    const sections = [...(version.sections ?? [])].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sections.length && i < dto.sections.length; i++) {
      const entity = sections[i];
      const incoming = dto.sections[i];
      const nextX = incoming.flowPositionX ?? null;
      const nextY = incoming.flowPositionY ?? null;
      if (entity.flowPositionX !== nextX || entity.flowPositionY !== nextY) {
        entity.flowPositionX = nextX;
        entity.flowPositionY = nextY;
        await manager.save(entity);
      }
    }
  }

  /**
   * Grava só as configurações da versão (modo do formulário, identificação opcional...),
   * sem tocar em mais nada — mesmo raciocínio do `syncFlowPositions`: chamado quando o hash
   * de estrutura não mudou, então trocar só uma configuração (sem mexer em campo/seção)
   * ainda precisa persistir de algum jeito.
   */
  private async syncVersionSettings(
    manager: EntityManager,
    version: FormVersionEntity,
    dto: CreateFormDto,
  ): Promise<void> {
    // Os dois lados passam pelo mesmo default: uma versão antiga sem settingsJson salvo
    // (fixture de teste, ou dado de antes dessa configuração existir) e um DTO que não
    // mandou settingsJson são o "mesmo" valor efetivo — não uma mudança real.
    const current = version.settingsJson ?? { mode: 'single' };
    const next = dto.settingsJson ? { ...dto.settingsJson } : { mode: 'single' };
    if (JSON.stringify(canonicalize(current)) !== JSON.stringify(canonicalize(next))) {
      version.settingsJson = next;
      await manager.save(version);
    }
  }
}
