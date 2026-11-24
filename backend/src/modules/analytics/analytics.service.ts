import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { FormFieldType } from '../../common/enums/form-field-type.enum';
import {
  FormEntity,
  FormVersionEntity,
  SubmissionEntity,
  UserEntity,
} from '../../database/entities';
import { ProcessAccessService } from '../access/process-access.service';

const NUMERIC_TYPES: Set<FormFieldType> = new Set([
  FormFieldType.NUMBER,
  FormFieldType.SCALE,
  FormFieldType.RATING,
  FormFieldType.CURRENCY,
  FormFieldType.CALCULATED,
]);

const CHOICE_TYPES: Set<FormFieldType> = new Set([
  FormFieldType.SINGLE_SELECT,
  FormFieldType.MULTI_SELECT,
  FormFieldType.CHECKBOX,
]);

const TEXT_TYPES: Set<FormFieldType> = new Set([
  FormFieldType.SHORT_TEXT,
  FormFieldType.LONG_TEXT,
  FormFieldType.EMAIL,
  FormFieldType.PHONE,
  FormFieldType.CPF,
  FormFieldType.CNPJ,
  FormFieldType.CEP,
]);

export type FieldStat = {
  fieldCode: string;
  fieldLabel: string;
  fieldType: FormFieldType;
  responseCount: number;
  emptyCount: number;
  distribution?: Array<{ value: string; count: number; percentage: number }>;
  numericStats?: { min: number; max: number; avg: number };
  topValues?: Array<{ value: string; count: number }>;
};

export type FormAnalytics = {
  totalSubmissions: number;
  submissionsLast30Days: number;
  submissionsLast7Days: number;
  completionRate: number;
  avgCompletionTimeSeconds: number | null;
  submissionsByDay: Array<{ date: string; count: number }>;
  fieldStats: FieldStat[];
};

const TOP_VALUES_LIMIT = 5;

type CountRow = { field_code: string; response_count: number; empty_count: number };
type NumericRow = { field_code: string; min: number | null; max: number | null; avg: number | null };
type ValueCountRow = { field_code: string; value: string; count: number };

/** Agrupa linhas `(campo, valor, contagem)` por codigo de campo. */
function groupValueCounts(
  rows: ValueCountRow[],
): Map<string, Array<{ value: string; count: number }>> {
  const byCode = new Map<string, Array<{ value: string; count: number }>>();
  for (const row of rows) {
    const list = byCode.get(row.field_code) ?? [];
    list.push({ value: row.value, count: Number(row.count) });
    byCode.set(row.field_code, list);
  }
  return byCode;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(FormEntity)
    private readonly formsRepository: Repository<FormEntity>,
    @InjectRepository(FormVersionEntity)
    private readonly formVersionsRepository: Repository<FormVersionEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissionsRepository: Repository<SubmissionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly processAccess: ProcessAccessService,
  ) {}

  private async assertFormAccess(formId: string, actorId: string): Promise<FormEntity> {
    const [form, actor] = await Promise.all([
      this.formsRepository.findOne({ where: { id: formId } }),
      this.usersRepository.findOne({ where: { id: actorId } }),
    ]);

    if (!form) throw new NotFoundException('Formulário não encontrado.');
    if (!actor) throw new NotFoundException('Usuário não encontrado.');

    // "Ver o painel do processo" no vínculo (ou acesso total pelo perfil).
    if (!(await this.processAccess.hasInProcess({ sub: actor.id, role: actor.role }, form.id, 'analytics.view'))) {
      throw new ForbiddenException('Acesso negado.');
    }

    return form;
  }

  async getFormAnalytics(formId: string, actorId: string): Promise<FormAnalytics> {
    await this.assertFormAccess(formId, actorId);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const latestVersion = await this.formVersionsRepository.findOne({
      where: { formId },
      order: { versionNumber: 'DESC' },
      relations: ['sections', 'sections.fields'],
    });

    const fieldMap = new Map<string, { label: string; fieldType: FormFieldType }>();
    for (const section of latestVersion?.sections ?? []) {
      for (const field of section.fields ?? []) {
        fieldMap.set(field.code, { label: field.label, fieldType: field.fieldType });
      }
    }

    const trendQb = this.submissionsRepository
      .createQueryBuilder('submission')
      .select("DATE_TRUNC('day', submission.submitted_at)", 'day')
      .addSelect('COUNT(submission.id)', 'count')
      .where('submission.form_id = :formId', { formId })
      .andWhere('submission.submitted_at >= :from', { from: thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', submission.submitted_at)")
      .orderBy("DATE_TRUNC('day', submission.submitted_at)", 'ASC');

    // Submissões que produziram ao menos um item — contado no banco, não
    // derivado de uma amostra dos itens carregados em memória.
    const answeredQuery = this.submissionsRepository.manager.query<Array<{ answered: string }>>(
      `SELECT COUNT(DISTINCT si.submission_id)::int AS answered
       FROM submission_items si
       INNER JOIN submissions s ON s.id = si.submission_id
       WHERE s.form_id = $1`,
      [formId],
    );

    const [totalCount, last30Count, last7Count, trendRaw, answeredRows, fieldStats] =
      await Promise.all([
        this.submissionsRepository.count({ where: { formId } }),
        this.submissionsRepository.count({
          where: { formId, submittedAt: MoreThanOrEqual(thirtyDaysAgo) },
        }),
        this.submissionsRepository.count({
          where: { formId, submittedAt: MoreThanOrEqual(sevenDaysAgo) },
        }),
        trendQb.getRawMany<{ day: string; count: string }>(),
        answeredQuery,
        this.computeFieldStats(formId, fieldMap),
      ]);

    const trendMap = new Map(
      trendRaw.map((row) => [new Date(row.day).toISOString().slice(0, 10), Number(row.count)]),
    );
    const trendStart = new Date();
    trendStart.setUTCHours(0, 0, 0, 0);
    trendStart.setUTCDate(trendStart.getUTCDate() - 29);

    const submissionsByDay = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(trendStart);
      day.setUTCDate(trendStart.getUTCDate() + index);
      const key = day.toISOString().slice(0, 10);
      return { date: key, count: trendMap.get(key) ?? 0 };
    });

    const answeredCount = Number(answeredRows[0]?.answered ?? 0);
    const completionRate = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

    return {
      totalSubmissions: totalCount,
      submissionsLast30Days: last30Count,
      submissionsLast7Days: last7Count,
      completionRate,
      avgCompletionTimeSeconds: null,
      submissionsByDay,
      fieldStats,
    };
  }

  /**
   * Estatisticas por campo, agregadas no banco.
   *
   * A versao anterior puxava os itens crus com `LIMIT 50000` e somava em
   * JavaScript: passando desse teto os numeros ficavam silenciosamente errados,
   * que e o pior modo de falhar num indicador. Agora sao quatro agregacoes em
   * SQL, cada uma varrendo so o que precisa — e o indice composto de
   * `submission_items` (migracao 1786900000000) sustenta as quatro.
   */
  private async computeFieldStats(
    formId: string,
    fieldMap: Map<string, { label: string; fieldType: FormFieldType }>,
  ): Promise<FieldStat[]> {
    const codes = [...fieldMap.keys()];
    if (codes.length === 0) return [];

    const manager = this.submissionsRepository.manager;

    const choiceCodes = codes.filter((code) =>
      CHOICE_TYPES.has(fieldMap.get(code)?.fieldType as FormFieldType),
    );
    const multiSelectCodes = choiceCodes.filter(
      (code) => fieldMap.get(code)?.fieldType === FormFieldType.MULTI_SELECT,
    );
    const singleChoiceCodes = choiceCodes.filter(
      (code) => fieldMap.get(code)?.fieldType !== FormFieldType.MULTI_SELECT,
    );
    const numericCodes = codes.filter((code) =>
      NUMERIC_TYPES.has(fieldMap.get(code)?.fieldType as FormFieldType),
    );
    const textCodes = codes.filter((code) =>
      TEXT_TYPES.has(fieldMap.get(code)?.fieldType as FormFieldType),
    );

    const [counts, numericRows, choiceRows, multiRows, textRows] = await Promise.all([
      manager.query<CountRow[]>(
        `SELECT si.field_code,
                COUNT(*)::int AS response_count,
                COUNT(*) FILTER (
                  WHERE si.value_text IS NULL AND si.value_number IS NULL
                    AND si.value_boolean IS NULL AND si.value_json IS NULL
                )::int AS empty_count
         FROM submission_items si
         INNER JOIN submissions s ON s.id = si.submission_id
         WHERE s.form_id = $1 AND si.field_code = ANY($2)
         GROUP BY si.field_code`,
        [formId, codes],
      ),
      numericCodes.length === 0
        ? Promise.resolve([])
        : manager.query<NumericRow[]>(
            `SELECT si.field_code,
                    MIN(si.value_number) AS min,
                    MAX(si.value_number) AS max,
                    AVG(si.value_number) AS avg
             FROM submission_items si
             INNER JOIN submissions s ON s.id = si.submission_id
             WHERE s.form_id = $1 AND si.field_code = ANY($2) AND si.value_number IS NOT NULL
             GROUP BY si.field_code`,
            [formId, numericCodes],
          ),
      singleChoiceCodes.length === 0
        ? Promise.resolve([])
        : manager.query<ValueCountRow[]>(
            `SELECT si.field_code, si.value_text AS value, COUNT(*)::int AS count
             FROM submission_items si
             INNER JOIN submissions s ON s.id = si.submission_id
             WHERE s.form_id = $1 AND si.field_code = ANY($2) AND si.value_text IS NOT NULL
             GROUP BY si.field_code, si.value_text`,
            [formId, singleChoiceCodes],
          ),
      // Múltipla escolha guarda um array em `value_json`: cada opção marcada
      // conta como uma ocorrência, igual ao comportamento anterior.
      multiSelectCodes.length === 0
        ? Promise.resolve([])
        : manager.query<ValueCountRow[]>(
            `SELECT si.field_code, opt.value AS value, COUNT(*)::int AS count
             FROM submission_items si
             INNER JOIN submissions s ON s.id = si.submission_id
             CROSS JOIN LATERAL jsonb_array_elements_text(si.value_json) AS opt(value)
             WHERE s.form_id = $1 AND si.field_code = ANY($2)
               AND jsonb_typeof(si.value_json) = 'array'
             GROUP BY si.field_code, opt.value`,
            [formId, multiSelectCodes],
          ),
      textCodes.length === 0
        ? Promise.resolve([])
        : manager.query<ValueCountRow[]>(
            `SELECT field_code, value, count FROM (
               SELECT si.field_code,
                      btrim(si.value_text) AS value,
                      COUNT(*)::int AS count,
                      ROW_NUMBER() OVER (
                        PARTITION BY si.field_code ORDER BY COUNT(*) DESC, btrim(si.value_text) ASC
                      ) AS rank
               FROM submission_items si
               INNER JOIN submissions s ON s.id = si.submission_id
               WHERE s.form_id = $1 AND si.field_code = ANY($2)
                 AND si.value_text IS NOT NULL AND btrim(si.value_text) <> ''
               GROUP BY si.field_code, btrim(si.value_text)
             ) ranked
             WHERE rank <= ${TOP_VALUES_LIMIT}`,
            [formId, textCodes],
          ),
    ]);

    const countByCode = new Map(counts.map((row) => [row.field_code, row]));
    const numericByCode = new Map(numericRows.map((row) => [row.field_code, row]));
    const distributionByCode = groupValueCounts([...choiceRows, ...multiRows]);
    const topValuesByCode = groupValueCounts(textRows);

    return [...fieldMap.entries()].map(([code, fieldInfo]) => {
      const count = countByCode.get(code);
      const numeric = numericByCode.get(code);

      let distribution: FieldStat['distribution'];
      if (CHOICE_TYPES.has(fieldInfo.fieldType)) {
        const entries = distributionByCode.get(code) ?? [];
        const total = entries.reduce((sum, entry) => sum + entry.count, 0);
        distribution = entries
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((entry) => ({
            value: entry.value,
            count: entry.count,
            percentage: total > 0 ? Math.round((entry.count / total) * 100) : 0,
          }));
      }

      let numericStats: FieldStat['numericStats'];
      if (NUMERIC_TYPES.has(fieldInfo.fieldType) && numeric && numeric.avg !== null) {
        numericStats = {
          min: Number(numeric.min),
          max: Number(numeric.max),
          avg: Math.round(Number(numeric.avg) * 100) / 100,
        };
      }

      let topValues: FieldStat['topValues'];
      if (TEXT_TYPES.has(fieldInfo.fieldType)) {
        topValues = (topValuesByCode.get(code) ?? [])
          .slice()
          .sort((a, b) => b.count - a.count)
          .map((entry) => ({ value: entry.value, count: entry.count }));
      }

      return {
        fieldCode: code,
        fieldLabel: fieldInfo.label,
        fieldType: fieldInfo.fieldType,
        responseCount: count?.response_count ?? 0,
        emptyCount: count?.empty_count ?? 0,
        distribution,
        numericStats,
        topValues,
      };
    });
  }
}