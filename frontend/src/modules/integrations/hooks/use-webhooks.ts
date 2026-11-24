import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-keys';
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  fetchInboundWebhookEvents,
  fetchWhatsAppMessages,
  fetchWhatsAppStatus,
  fetchWebhookDeliveries,
  fetchWebhookEndpoints,
  retryWebhookDelivery,
  type CreateWebhookEndpointInput,
  type FetchInboundWebhookEventsParams,
  type FetchWhatsAppMessagesParams,
  type FetchWebhookDeliveriesParams,
} from '../services/webhooks-api';

export function useWebhookEndpointsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.webhooks.endpoints(),
    queryFn: fetchWebhookEndpoints,
    staleTime: 60_000,
    enabled,
  });
}

export function useCreateWebhookEndpointMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWebhookEndpointInput) => createWebhookEndpoint(dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.endpoints() });
    },
  });
}

export function useDeleteWebhookEndpointMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWebhookEndpoint,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.endpoints() });
    },
  });
}

export function useWebhookDeliveriesQuery(params: FetchWebhookDeliveriesParams) {
  return useQuery({
    queryKey: queryKeys.webhooks.deliveries(params),
    queryFn: () => fetchWebhookDeliveries(params),
    staleTime: 30_000,
  });
}

export function useRetryWebhookDeliveryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: retryWebhookDelivery,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.deliveriesAll() });
    },
  });
}

export function useInboundWebhookEventsQuery(params: FetchInboundWebhookEventsParams) {
  return useQuery({
    queryKey: queryKeys.webhooks.events(params),
    queryFn: () => fetchInboundWebhookEvents(params),
    staleTime: 30_000,
  });
}

export function useWhatsAppMessagesQuery(
  params: FetchWhatsAppMessagesParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.webhooks.whatsappMessages(params),
    queryFn: () => fetchWhatsAppMessages(params),
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
}

export function useWhatsAppStatusQuery() {
  return useQuery({
    queryKey: queryKeys.webhooks.whatsappStatus(),
    queryFn: fetchWhatsAppStatus,
    staleTime: 30_000,
  });
}
