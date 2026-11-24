import { ERP_RETRY_QUEUE_NAME } from '../../../common/constants/product';

export const ERP_RETRY_QUEUE = ERP_RETRY_QUEUE_NAME;

export type ErpRetryJob = {
  logId: string;
};
