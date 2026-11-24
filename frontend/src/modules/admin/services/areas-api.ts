import { api } from '../../../services/api';

export type Area = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAreaPayload = {
  name: string;
  code?: string | null;
  description?: string | null;
  parentId?: string | null;
};

export type UpdateAreaPayload = {
  name?: string;
  code?: string | null;
  description?: string | null;
  parentId?: string | null;
  isActive?: boolean;
};

export async function fetchAreas(includeInactive = false): Promise<Area[]> {
  const { data } = await api.get<Area[]>('/areas', {
    params: includeInactive ? { includeInactive: true } : undefined,
  });
  return data;
}

export async function fetchAreaById(id: string): Promise<Area> {
  const { data } = await api.get<Area>(`/areas/${id}`);
  return data;
}

export async function createArea(payload: CreateAreaPayload): Promise<Area> {
  const { data } = await api.post<Area>('/areas', payload);
  return data;
}

export async function updateArea(id: string, payload: UpdateAreaPayload): Promise<Area> {
  const { data } = await api.patch<Area>(`/areas/${id}`, payload);
  return data;
}

export async function deactivateArea(id: string): Promise<void> {
  await api.delete(`/areas/${id}`);
}
