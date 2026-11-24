import {
  InvalidNotificationTransitionError,
  assertRecipientTransition,
  canTransitionRecipient,
  deriveMessageStatus,
  isTerminalMessageStatus,
  isTerminalRecipientStatus,
} from './notification-state';
import {
  NOTIFICATION_RECIPIENT_STATUSES,
  type NotificationRecipientStatus,
} from './notification.types';

describe('notification-state', () => {
  describe('transições de destinatário', () => {
    const allowed: Array<[NotificationRecipientStatus, NotificationRecipientStatus]> = [
      ['scheduled', 'processing'],
      ['scheduled', 'cancelled'],
      ['pending', 'processing'],
      ['pending', 'cancelled'],
      ['processing', 'sent'],
      ['processing', 'delivered'],
      ['processing', 'pending'],
      ['processing', 'failed'],
      ['sent', 'delivered'],
      ['failed', 'pending'],
    ];

    it.each(allowed)('permite %s → %s', (from, to) => {
      expect(canTransitionRecipient(from, to)).toBe(true);
      expect(() => assertRecipientTransition(from, to)).not.toThrow();
    });

    it('permite exatamente as transições declaradas e nenhuma outra', () => {
      const allowedKeys = new Set(allowed.map(([a, b]) => `${a}>${b}`));
      for (const from of NOTIFICATION_RECIPIENT_STATUSES) {
        for (const to of NOTIFICATION_RECIPIENT_STATUSES) {
          expect(canTransitionRecipient(from, to)).toBe(allowedKeys.has(`${from}>${to}`));
        }
      }
    });

    it('não deixa cancelar uma tentativa em andamento (o provedor pode já ter aceitado)', () => {
      expect(canTransitionRecipient('processing', 'cancelled')).toBe(false);
    });

    it('não deixa sair de estados terminais, exceto retentativa manual de failed', () => {
      expect(canTransitionRecipient('delivered', 'pending')).toBe(false);
      expect(canTransitionRecipient('cancelled', 'pending')).toBe(false);
      expect(canTransitionRecipient('sent', 'failed')).toBe(false);
      expect(canTransitionRecipient('failed', 'pending')).toBe(true);
    });

    it('assertRecipientTransition lança erro tipado com origem e destino', () => {
      try {
        assertRecipientTransition('sent', 'pending');
        fail('deveria ter lançado');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidNotificationTransitionError);
        expect((error as InvalidNotificationTransitionError).from).toBe('sent');
        expect((error as InvalidNotificationTransitionError).to).toBe('pending');
        expect((error as Error).message).toContain('sent → pending');
      }
    });
  });

  describe('deriveMessageStatus', () => {
    it.each<[NotificationRecipientStatus[], string]>([
      [['sent'], 'sent'],
      [['sent', 'sent', 'sent'], 'sent'],
      [['delivered', 'delivered'], 'delivered'],
      [['sent', 'delivered'], 'sent'],
      [['failed'], 'failed'],
      [['failed', 'failed'], 'failed'],
      [['cancelled'], 'cancelled'],
      [['cancelled', 'cancelled'], 'cancelled'],
      [['sent', 'failed'], 'partially_sent'],
      [['delivered', 'failed', 'sent'], 'partially_sent'],
      [['sent', 'cancelled'], 'partially_sent'],
      [['failed', 'cancelled'], 'failed'],
      [['scheduled', 'scheduled'], 'scheduled'],
      [['pending', 'sent'], 'pending'],
      [['scheduled', 'sent'], 'scheduled'],
      [['processing', 'pending', 'sent'], 'processing'],
      [['processing', 'failed'], 'processing'],
    ])('%j → %s', (statuses, expected) => {
      expect(deriveMessageStatus(statuses)).toBe(expected);
    });

    it('lista vazia é falha (uma notificação sem destinatário não entregou nada)', () => {
      expect(deriveMessageStatus([])).toBe('failed');
    });
  });

  it('classifica estados terminais', () => {
    expect(isTerminalRecipientStatus('sent')).toBe(true);
    expect(isTerminalRecipientStatus('failed')).toBe(true);
    expect(isTerminalRecipientStatus('pending')).toBe(false);
    expect(isTerminalMessageStatus('partially_sent')).toBe(true);
    expect(isTerminalMessageStatus('processing')).toBe(false);
    expect(isTerminalMessageStatus('scheduled')).toBe(false);
  });
});
