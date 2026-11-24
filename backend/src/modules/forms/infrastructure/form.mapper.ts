import { randomUUID } from 'crypto';
import {
  FormEntity,
  FormFieldEntity,
  FormFieldOptionEntity,
  FormSectionEntity,
  FormVersionEntity,
} from '../../../database/entities';
import { Form } from '../domain/form.aggregate';
import { FormField } from '../domain/form-field.entity';
import { FormFieldOption } from '../domain/form-field-option.entity';
import { FormSection } from '../domain/form-section.entity';
import { FormVersion } from '../domain/form-version.entity';

export interface PersistenceResult {
  form: FormEntity;
  versions: FormVersionEntity[];
  sections: FormSectionEntity[];
  fields: FormFieldEntity[];
  options: FormFieldOptionEntity[];
}

export class FormMapper {
  static toDomain(entity: FormEntity): Form {
    const versions = (entity.versions ?? []).map((v) => {
      const sections = (v.sections ?? []).map((s) => {
        const fields = (s.fields ?? []).map((f) => {
          const options = (f.options ?? []).map(
            (o) =>
              new FormFieldOption({
                id: o.id,
                fieldId: o.fieldId,
                internalValue: o.internalValue,
                displayLabel: o.displayLabel,
                order: o.order,
              }),
          );
          return new FormField({
            id: f.id,
            formVersionId: f.formVersionId,
            sectionId: f.sectionId,
            code: f.code,
            label: f.label,
            fieldType: f.fieldType,
            order: f.order,
            required: f.required,
            settingsJson: f.settingsJson ?? {},
            conditionsJson: f.conditionsJson ?? {},
            options,
          });
        });
        return new FormSection({
          id: s.id,
          formVersionId: s.formVersionId,
          title: s.title,
          description: s.description,
          order: s.order,
          fields,
        });
      });

      return new FormVersion({
        id: v.id,
        formId: v.formId,
        versionNumber: v.versionNumber,
        titleDisplay: v.titleDisplay,
        descriptionDisplay: v.descriptionDisplay,
        isPublished: v.isPublished,
        publishedAt: v.publishedAt,
        settingsJson: v.settingsJson ?? {},
        sections,
        createdAt: v.createdAt,
      });
    });

    return new Form({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      category: entity.category,
      area: entity.area,
      createdBy: entity.createdBy,
      // Acesso agora é vínculo (form_members), não atribuição.
      assignedUserIds: [],
      googleSheetsEnabled: entity.googleSheetsEnabled,
      googleSheetsAutoCreate: entity.googleSheetsAutoCreate,
      googleSpreadsheetId: entity.googleSpreadsheetId,
      googleSpreadsheetUrl: entity.googleSpreadsheetUrl,
      googleSheetTitle: entity.googleSheetTitle,
      googleLinkedUserId: entity.googleLinkedUserId,
      googleLastSyncedAt: entity.googleLastSyncedAt,
      googleLastError: entity.googleLastError,
      versions,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toPersistence(form: Form): PersistenceResult {
    const formEntity = new FormEntity();
    formEntity.id = form.id;
    formEntity.name = form.name;
    formEntity.description = form.description;
    formEntity.status = form.status;
    formEntity.category = form.category;
    formEntity.area = form.area;
    formEntity.createdBy = form.createdBy;
    // Atribuicoes sao gravadas pelo FormsService a partir de usuarios resolvidos;
    // o mapper nao inventa entidades de usuario a partir de ids soltos.
    formEntity.googleSheetsEnabled = form.googleSheetsEnabled;
    formEntity.googleSheetsAutoCreate = form.googleSheetsAutoCreate;
    formEntity.googleSpreadsheetId = form.googleSpreadsheetId;
    formEntity.googleSpreadsheetUrl = form.googleSpreadsheetUrl;
    formEntity.googleSheetTitle = form.googleSheetTitle;
    formEntity.googleLinkedUserId = form.googleLinkedUserId;
    formEntity.googleLastSyncedAt = form.googleLastSyncedAt;
    formEntity.googleLastError = form.googleLastError;
    formEntity.createdAt = form.createdAt;
    formEntity.updatedAt = form.updatedAt;

    const versions: FormVersionEntity[] = [];
    const sections: FormSectionEntity[] = [];
    const fields: FormFieldEntity[] = [];
    const options: FormFieldOptionEntity[] = [];

    for (const v of form.versions) {
      const vEntity = new FormVersionEntity();
      vEntity.id = v.id;
      vEntity.formId = form.id;
      vEntity.versionNumber = v.versionNumber;
      vEntity.titleDisplay = v.titleDisplay;
      vEntity.descriptionDisplay = v.descriptionDisplay;
      vEntity.isPublished = v.isPublished;
      vEntity.publishedAt = v.publishedAt;
      vEntity.settingsJson = v.settingsJson;
      vEntity.createdAt = v.createdAt;
      versions.push(vEntity);

      for (const s of v.sections) {
        const sEntity = new FormSectionEntity();
        sEntity.id = s.id;
        sEntity.formVersionId = v.id;
        sEntity.title = s.title;
        sEntity.description = s.description;
        sEntity.order = s.order;
        sections.push(sEntity);

        for (const f of s.fields) {
          const fEntity = new FormFieldEntity();
          fEntity.id = f.id;
          fEntity.formVersionId = v.id;
          fEntity.sectionId = s.id;
          fEntity.code = f.code;
          fEntity.label = f.label;
          fEntity.fieldType = f.fieldType;
          fEntity.order = f.order;
          fEntity.required = f.required;
          fEntity.settingsJson = f.settingsJson;
          fEntity.conditionsJson = f.conditionsJson;
          fields.push(fEntity);

          for (const o of f.options) {
            const oEntity = new FormFieldOptionEntity();
            oEntity.id = o.id;
            oEntity.fieldId = f.id;
            oEntity.internalValue = o.internalValue;
            oEntity.displayLabel = o.displayLabel;
            oEntity.order = o.order;
            options.push(oEntity);
          }
        }
      }
    }

    return { form: formEntity, versions, sections, fields, options };
  }

  static newVersionId(): string {
    return randomUUID();
  }
}
