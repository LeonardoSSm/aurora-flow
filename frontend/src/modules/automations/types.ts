export type AutomationTrigger = 'on_submission' | 'on_section_reached';

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty';

export type AutomationCondition = {
  fieldCode: string;
  operator: ConditionOperator;
  value?: string;
};

export type AutomationConditions = {
  match: 'all' | 'any';
  rules: AutomationCondition[];
};

export type SendEmailAction = {
  type: 'send_email';
  to: string;
  subject: string;
  body: string;
};

export type WebhookAction = {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'GET' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
};

export type NotifyUsersAction = {
  type: 'notify_users';
  userIds: string[];
  message: string;
};

export type AutomationAction = SendEmailAction | WebhookAction | NotifyUsersAction;

export type AutomationRule = {
  id: string;
  formId: string;
  name: string;
  isActive: boolean;
  trigger: AutomationTrigger;
  targetSectionId: string | null;
  conditions: AutomationConditions | null;
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
};

export type AutomationExecutionStatus = 'pending' | 'running' | 'success' | 'failed';

export type AutomationExecution = {
  id: string;
  ruleId: string;
  submissionId: string | null;
  status: AutomationExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  actionsExecuted: { type: string; executedAt: string }[];
  createdAt: string;
};
