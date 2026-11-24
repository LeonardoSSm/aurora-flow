export type ResponseItem = {
  id: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  valueJson: unknown | null;
};

export type ResponseRecord = {
  id: string;
  responderName: string | null;
  responderEmail: string | null;
  status: string;
  submittedAt: string | null;
  items: ResponseItem[];
};

export type ResponseRecordWithForm = ResponseRecord & {
  formId: string;
  formName: string;
};
