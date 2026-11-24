export type LabelValidationFieldStatus = 'OK' | 'DIVERGENTE' | 'AUSENTE' | 'ATENCAO';

export type LabelValidationField = {
  valor: string;
  status: LabelValidationFieldStatus;
};

/** Formato de `data` retornado pelo agente `validador-de-etiquetas`. */
export type LabelValidationResult = {
  aprovada: boolean;
  lote: LabelValidationField;
  fabricacao: LabelValidationField;
  validade: LabelValidationField;
  tipo: string;
  mensagem: string;
};
