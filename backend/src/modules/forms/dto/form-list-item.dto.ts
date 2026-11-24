import type { FormStatus } from '../../../common/enums/form-status.enum';
import type { FormAppearance } from '../../../database/entities/form.entity';

export class FormListItemDto {
  id!: string;
  name!: string;
  description!: string | null;
  status!: FormStatus;
  category!: string | null;
  area!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  googleSheetsEnabled!: boolean;
  /** Cor e ícone do card do processo; null = padrão. */
  appearance!: FormAppearance | null;
  submissionCount!: number;
  latestVersionNumber!: number;
  createdByUser!: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
  /**
   * LEGADO — sempre vazio. A atribuição virou vínculo (form_members); o campo continua só porque o app
   * do tablet já instalado lê `assignees.length` na lista de processos.
   */
  assignees!: Array<{ id: string; fullName: string; email: string; role: string }>;
}
