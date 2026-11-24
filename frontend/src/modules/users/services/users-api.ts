import { api } from '../../../services/api';

export type AssignableUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

export async function fetchAssignableUsers(assignableAs?: string): Promise<AssignableUser[]> {
  const { data } = await api.get<AssignableUser[]>('/users/assignable', {
    params: assignableAs ? { assignableAs } : undefined,
  });
  return data;
}
