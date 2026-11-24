import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/**
 * Link de aviso do sistema (o caminho que o web abriria) → tela do app. Formatos do backend
 * (user-notice.service.ts): `/solicitacoes?solicitationId=…` e `/aprovacoes?id=…`.
 */
export function openAppLink(navigation: Pick<NavigationProp<RootStackParamList>, 'navigate'>, link: string): boolean {
  const [path, query = ''] = link.replace(/^https?:\/\/[^/]+/, '').split('?');
  // URLSearchParams do React Native é incompleto: lê a query na mão.
  const values = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key) values.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
  }
  const params = { get: (key: string) => values.get(key) ?? null };
  const solicitationId = params.get('solicitationId') ?? params.get('card');
  if (solicitationId) {
    navigation.navigate('Card', { solicitationId });
    return true;
  }
  if (path.startsWith('/aprovacoes')) {
    const approvalId = params.get('id');
    if (approvalId) navigation.navigate('ApprovalLink', { approvalId });
    else navigation.navigate('Tabs', { screen: 'Approvals' });
    return true;
  }
  if (path.startsWith('/kanban/')) {
    const formId = path.split('/')[2];
    if (formId) {
      navigation.navigate('Board', { formId, formName: 'Processo' });
      return true;
    }
  }
  if (path.startsWith('/solicitacoes')) {
    navigation.navigate('Solicitations');
    return true;
  }
  return false;
}
