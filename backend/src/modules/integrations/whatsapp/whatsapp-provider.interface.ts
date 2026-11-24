export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface IWhatsAppProvider {
  sendMessage(dto: WhatsAppSendDto): Promise<WhatsAppSendResult>;
  isConfigured(): boolean;
  /** Grupos de que a instância participa — é de onde sai o JID para mandar mensagem a um grupo. */
  listGroups(): Promise<WhatsAppGroup[]>;
}

export interface WhatsAppGroup {
  /** JID do grupo (`...@g.us`), usado como destinatário. */
  id: string;
  /** Nome do grupo. */
  subject: string;
  size: number | null;
}

export interface WhatsAppSendDto {
  to: string;
  message: string;
  sessionId?: string;
}

export interface WhatsAppSendResult {
  messageId: string | null;
  status: 'sent' | 'failed' | 'queued';
  rawResponse?: unknown;
  error?: string;
}
