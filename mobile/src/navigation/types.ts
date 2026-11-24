import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Processes: undefined;
  NewRequest: undefined;
  Approvals: undefined;
  Inbox: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** O card: fase, respostas, atividade e anexos. `focusDecision` rola até a aprovação pendente. */
  Card: { solicitationId: string; title?: string; focusDecision?: boolean };
  Board: { formId: string; formName: string };
  Solicitations: { mine?: boolean; title?: string } | undefined;
  /** Abre uma aprovação pelo id (link do aviso) e leva ao card dela. */
  ApprovalLink: { approvalId: string };
  FormFill: { formId: string; title?: string };
  FormDone: { submissionId: string; formTitle: string; formId: string };
  Profile: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
