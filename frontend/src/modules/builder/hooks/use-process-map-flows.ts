import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../../components/ui';
import { queryKeys } from '../../../lib/query-keys';
import { nodeLibraryLabel } from '../../flows/components/NodeLibrary';
import { defaultNodeData } from '../../flows/hooks/useFlowEditor';
import { validateFlow } from '../../flows/lib/flow-validation';
import { createFlowForForm, deleteFlow, fetchFlows, updateFlow } from '../../flows/services/flows-api';
import type { Flow, FlowNode, FlowNodeData, FlowNodeType } from '../../flows/types/flow.types';
import {
  FORM_TRIGGERS,
  linkPhaseToNode,
  type MapGroup,
  type MapPoint,
} from '../lib/process-map-flows';

/** Situação de uma automação com mudança ainda não gravada. */
export type PendingStatus = { key: string; name: string; isDraft: boolean; problem: string | null; saving: boolean };

let idSeq = 0;
/** Id de nó único no processo inteiro (rascunhos juntam nós de grupos diferentes). */
export function newMapNodeId(): string {
  return `no_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;
}

function toGroup(flow: Flow): MapGroup {
  return { key: flow.id, flowId: flow.id, name: flow.name, isActive: flow.isActive, nodes: flow.nodes, edges: flow.edges };
}

function storageKey(formId: string) {
  return `tf.processMap.pending.${formId}`;
}

// localStorage pode lançar (modo privado, cota): aí o rascunho vale só até recarregar.
function readPending(formId: string | null): Record<string, MapGroup> {
  if (!formId) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(formId));
    return raw ? (JSON.parse(raw) as Record<string, MapGroup>) : {};
  } catch {
    return {};
  }
}

function writePending(formId: string, pending: Record<string, MapGroup>) {
  try {
    if (Object.keys(pending).length === 0) window.localStorage.removeItem(storageKey(formId));
    else window.localStorage.setItem(storageKey(formId), JSON.stringify(pending));
  } catch {
    // ignora
  }
}

/** Primeiro problema que impede gravar (null = pode gravar). */
export function groupProblem(group: MapGroup): string | null {
  if (group.nodes.length === 0) return null;
  return validateFlow(group.nodes, group.edges)[0]?.message ?? null;
}

/**
 * Automações do processo como aparecem no mapa: os fluxos salvos mais as mudanças ainda não
 * gravadas (rascunhos do mapa e edições de fluxos salvos), guardadas no navegador por processo.
 * Cada mudança que deixa a automação válida é gravada sozinha.
 */
export function useProcessMapFlows(formId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const flowsQuery = useQuery({
    queryKey: queryKeys.flows.byForm(formId ?? ''),
    queryFn: () => fetchFlows(formId as string),
    enabled: Boolean(formId) && enabled,
  });

  const [pending, setPending] = useState<Record<string, MapGroup>>(() => readPending(formId));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const loadedFor = useRef(formId);
  useEffect(() => {
    if (loadedFor.current === formId) return;
    loadedFor.current = formId;
    setPending(readPending(formId));
  }, [formId]);
  useEffect(() => {
    if (formId && loadedFor.current === formId) writePending(formId, pending);
  }, [formId, pending]);

  const groups = useMemo<MapGroup[]>(() => {
    const saved = (flowsQuery.data ?? []).map((flow) => pending[flow.id] ?? toGroup(flow));
    const drafts = Object.values(pending).filter((group) => !group.flowId);
    return [...saved, ...drafts];
  }, [flowsQuery.data, pending]);

  /** Grava a mudança de grupos (e tira os que deixaram de existir, ex.: rascunho que se juntou). */
  const commit = useCallback((changed: MapGroup[], removedKeys: string[] = []) => {
    setPending((current) => {
      const next = { ...current };
      for (const key of removedKeys) delete next[key];
      for (const group of changed) next[group.key] = group;
      return next;
    });
  }, []);

  const discard = useCallback((key: string) => {
    setPending((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  /** Nó novo da biblioteca, solto no mapa (e ligado à fase quando caiu em cima de uma). */
  const addNode = useCallback(
    (type: FlowNodeType, position: MapPoint, phase: { id: string; label: string } | null) => {
      if (!formId) return null;
      const nodeId = newMapNodeId();
      const base = defaultNodeData(type) as Record<string, unknown>;
      const data = {
        ...base,
        ...(FORM_TRIGGERS.has(type) ? { formId } : {}),
        mapPosition: { x: Math.round(position.x), y: Math.round(position.y) },
      };
      const node: FlowNode = { id: nodeId, type, position: { x: 400, y: 200 }, data: data as FlowNodeData };
      let group: MapGroup = {
        key: `rascunho:${nodeId}`,
        flowId: null,
        name: `${phase?.label ?? 'Mapa'}: ${nodeLibraryLabel(type)}`.slice(0, 150),
        isActive: true,
        nodes: [node],
        edges: [],
      };
      if (phase) {
        const linked = linkPhaseToNode(group, nodeId, phase, formId, newMapNodeId());
        if ('group' in linked) group = linked.group;
      }
      commit([group]);
      return { groupKey: group.key, nodeId };
    },
    [commit, formId],
  );

  // ── Gravação automática ──────────────────────────────────────────────
  const inFlight = useRef(new Set<string>());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!formId) return;
    const timer = setTimeout(() => {
      for (const group of Object.values(pending)) {
        if (inFlight.current.has(group.key)) continue;
        if (group.nodes.length === 0) {
          // Automação salva que ficou sem nós: apaga o fluxo; rascunho vazio só some.
          if (group.flowId) {
            inFlight.current.add(group.key);
            void deleteFlow(group.flowId)
              .then(() => {
                discard(group.key);
                void queryClient.invalidateQueries({ queryKey: queryKeys.flows.byForm(formId) });
              })
              .catch(() => showToast({ title: 'Não deu para apagar a automação', variant: 'error' }))
              .finally(() => inFlight.current.delete(group.key));
          } else {
            discard(group.key);
          }
          continue;
        }
        if (groupProblem(group)) continue;

        const snapshot = JSON.stringify(group);
        inFlight.current.add(group.key);
        setSaving((current) => ({ ...current, [group.key]: true }));
        const request = group.flowId
          ? updateFlow(group.flowId, { nodes: group.nodes, edges: group.edges })
          : createFlowForForm(formId, { name: group.name, isActive: true, nodes: group.nodes, edges: group.edges });
        void request
          .then((flow) => {
            setPending((current) => {
              const now = current[group.key];
              const next = { ...current };
              delete next[group.key];
              // Mexeram de novo enquanto gravava: a mudança nova continua pendente (no fluxo criado).
              if (now && JSON.stringify(now) !== snapshot) next[flow.id] = { ...now, key: flow.id, flowId: flow.id };
              return next;
            });
            queryClient.setQueryData<Flow[]>(queryKeys.flows.byForm(formId), (current) =>
              current ? [...current.filter((item) => item.id !== flow.id), flow] : current,
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.flows.byForm(formId) });
          })
          .catch((error: unknown) => {
            const message =
              (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
            showToast({
              title: 'Não deu para salvar a automação',
              description: typeof message === 'string' ? message : 'Tente de novo em instantes.',
              variant: 'error',
            });
          })
          .finally(() => {
            inFlight.current.delete(group.key);
            setSaving((current) => {
              const next = { ...current };
              delete next[group.key];
              return next;
            });
          });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [pending, formId, discard, queryClient, showToast]);

  const pendingStatus = useMemo<PendingStatus[]>(
    () =>
      Object.values(pending)
        .filter((group) => group.nodes.length > 0)
        .map((group) => ({
          key: group.key,
          name: group.name,
          isDraft: !group.flowId,
          problem: groupProblem(group),
          saving: Boolean(saving[group.key]),
        })),
    [pending, saving],
  );

  return { groups, flows: flowsQuery.data ?? [], commit, discard, addNode, pendingStatus };
}
