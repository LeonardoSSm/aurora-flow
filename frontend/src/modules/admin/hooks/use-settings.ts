import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bulkUpdateSettings, fetchSettings, updateSetting } from '../services/admin-api';

const SETTINGS_KEY = ['settings'] as const;

export function useSettingsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
    enabled,
  });
}

export function useUpdateSettingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

export function useUpdateAllSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{ key: string; value: string }>) => bulkUpdateSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
