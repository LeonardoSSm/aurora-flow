export type SendEmailAction = {
  type: 'send_email';
  to: string;
  subject: string;
  body: string;
};

export type WebhookAction = {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
  body?: string;
};

export type NotifyUsersAction = {
  type: 'notify_users';
  userIds: string[];
  message: string;
};

export type AutomationAction = SendEmailAction | WebhookAction | NotifyUsersAction;

export type AutomationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains';

export type AutomationCondition = {
  fieldCode: string;
  operator: AutomationConditionOperator;
  value?: string;
};

export type AutomationConditions = {
  match?: 'all' | 'any';
  rules?: AutomationCondition[];
};
