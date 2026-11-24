import { RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { useAdminEscape } from '../components/admin-modal-context';
import { useServiceStatusQuery } from '../hooks/use-service-status';
import { computeLayout, EDGE_COLORS } from '../service-map/layout';
import {
  galoMessage,
  type GaloPose,
  hasProblems,
  type MessagesById,
  STATE_META,
  stateCounts,
  type StatusById,
} from '../service-map/summary';
import {
  COLUMNS,
  dependenciesOf,
  dependentsOf,
  getService,
  SERVICE_EDGES,
  SERVICES,
  type ServiceDef,
  type ServiceState,
} from '../service-map/topology';
import type { ServiceMapStatusDto } from '../services/service-map-api';

const GALO_SRC: Record<GaloPose, string> = {
  ok: '/brand/tijuca/galo/galo-ok.webp',
  pensativo: '/brand/tijuca/galo/galo-pensativo.webp',
  apresentando: '/brand/tijuca/galo/galo-apresentando.webp',
  feliz: '/brand/tijuca/galo/galo-feliz.webp',
};

/** Quanto tempo o Galo comemora depois de um "Verificar agora" sem problemas. */
const CELEBRATE_MS = 4_000;

type NodeLook = {
  /** Estilo da borda e fundo. */
  box: string;
  border: string;
  shadow: string;
  icon: string;
  dot: string;
  label: string;
};

const RAISED = 'shadow-[0_4px_12px_rgba(13,29,41,.05)]';
const PULSE = 'animate-svc-pulse motion-reduce:animate-none';

/** README do handoff, tabela "Por estado". Neutros por token (iguais no tema claro, legíveis no escuro). */
const NODE_LOOK: Record<ServiceState, NodeLook> = {
  ativo: {
    box: 'border-solid bg-bg-surface',
    border: 'border-border-default',
    shadow: RAISED,
    icon: 'bg-primary/10 text-primary dark:text-blue-300',
    dot: 'bg-[#10b981]',
    label: 'text-[#065f46] dark:text-emerald-300',
  },
  demanda: {
    box: 'border-dashed bg-bg-s2',
    border: 'border-border-strong',
    shadow: 'shadow-none',
    icon: 'bg-bg-s3 text-tx-muted',
    dot: 'bg-[#9aaabb]',
    label: 'text-tx-muted',
  },
  degradado: {
    box: 'border-solid bg-bg-surface',
    border: 'border-[#fbbf24]',
    shadow: RAISED,
    icon: 'bg-[#fef3c7] text-[#d97706]',
    dot: cn('bg-[#f59e0b]', PULSE),
    label: 'text-[#92400e] dark:text-amber-300',
  },
  falha: {
    box: 'border-solid bg-bg-surface',
    border: 'border-[#fb7185]',
    shadow: RAISED,
    icon: 'bg-[#ffe4e6] text-[#e11d48]',
    dot: cn('bg-[#f43f5e]', PULSE),
    label: 'text-[#9f1239] dark:text-rose-300',
  },
};

/** Antes da primeira resposta do backend. */
const PENDING_LOOK: NodeLook = {
  box: 'border-solid bg-bg-surface',
  border: 'border-border-default',
  shadow: 'shadow-none',
  icon: 'bg-bg-s3 text-tx-muted',
  dot: 'bg-[#9aaabb]',
  label: 'text-tx-muted',
};

const NOTE_LOOK: Partial<Record<ServiceState, string>> = {
  falha: 'bg-[#fff1f2] text-[#9f1239]',
  degradado: 'bg-[#fffbeb] text-[#92400e]',
  demanda: 'bg-bg-s2 text-tx-secondary',
};

function stateLabel(state: ServiceState | undefined): string {
  return state ? STATE_META[state].label : 'Verificando…';
}

function fromDto(data: ServiceMapStatusDto | undefined): { states: StatusById; messages: MessagesById } {
  const states: StatusById = {};
  const messages: MessagesById = {};
  for (const service of data?.services ?? []) {
    states[service.id] = service.status;
    if (service.message) messages[service.id] = service.message;
  }
  return { states, messages };
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Administração › Plataforma › Mapa de serviços: os containers do docker-compose,
 * como se conectam e o estado de cada um (`GET /admin/service-map/status`).
 * Especificação: `design_handoff_mapa_servicos/README.md`.
 */
export function AdminServiceMapView() {
  const { data, dataUpdatedAt, isError, isFetching, isPending, refetch } = useServiceStatusQuery();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualCheck, setManualCheck] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>();

  useAdminEscape(() => setSelectedId(null), selectedId !== null);

  useEffect(() => {
    // Sem piscar ao trocar de pose.
    Object.values(GALO_SRC).forEach((src) => {
      new Image().src = src;
    });
    return () => clearTimeout(celebrateTimer.current);
  }, []);

  const { states: statusById, messages } = useMemo(() => fromDto(data), [data]);

  const layout = useMemo(
    () => computeLayout(SERVICES, SERVICE_EDGES, statusById, selectedId, COLUMNS),
    [statusById, selectedId],
  );
  const counts = stateCounts(statusById);

  const verifyNow = useCallback(async () => {
    setManualCheck(true);
    try {
      const result = await refetch();
      if (result.isSuccess && !hasProblems(fromDto(result.data).states)) {
        setCelebrating(true);
        clearTimeout(celebrateTimer.current);
        celebrateTimer.current = setTimeout(() => setCelebrating(false), CELEBRATE_MS);
      }
    } finally {
      setManualCheck(false);
    }
  }, [refetch]);

  const checking = (manualCheck && isFetching) || isPending;
  const galo = galoMessage(statusById, {
    checking,
    celebrate: celebrating,
    unavailable: isError && !data,
  });
  const lastCheckedAt = dataUpdatedAt;

  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));
  const selected = selectedId ? getService(selectedId) : undefined;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[14px]">
      {/* Barra: contadores e Verificar agora */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {counts.map((count) => (
            <span
              key={count.state}
              className="inline-flex items-center gap-1.5 rounded-full bg-bg-s2 px-2.5 py-[3px] text-xs font-semibold text-tx-secondary ring-1 ring-inset ring-border-default"
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: STATE_META[count.state].dot }}
                aria-hidden
              />
              {count.text}
            </span>
          ))}
          {isError ? (
            <span className="text-xs font-semibold text-[#9f1239] dark:text-rose-300">
              {data ? 'A última checagem falhou; mostrando a anterior.' : 'Não foi possível consultar o status.'}
            </span>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void verifyNow()}
            disabled={manualCheck}
            aria-busy={manualCheck}
            className="flex items-center gap-1.5 rounded-lg bg-bg-s2 px-2.5 py-1.5 text-[12.5px] font-bold text-tx-primary ring-1 ring-inset ring-border-default transition-colors hover:bg-bg-s3 disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', manualCheck && 'animate-spin motion-reduce:animate-none')}
              aria-hidden
            />
            {manualCheck ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>
      </div>

      {/* Mapa */}
      <div className="relative min-w-0 rounded-xl bg-bg-s2 ring-1 ring-inset ring-border-default">
        <div className="admin-scroll overflow-x-auto px-[18px] pb-[18px] pt-4">
          <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
            {layout.columns.map((column) => (
              <span
                key={column.label}
                className="absolute top-0 text-[10px] font-bold uppercase tracking-[0.14em] text-tx-muted"
                style={{ left: column.x }}
              >
                {column.label}
              </span>
            ))}

            <svg
              aria-hidden
              width={layout.width}
              height={layout.height}
              className="absolute inset-0 overflow-visible"
            >
              {layout.edges.map((edge) => (
                <g
                  key={`${edge.source}-${edge.target}`}
                  opacity={edge.opacity}
                  className="transition-opacity duration-150"
                >
                  <path
                    d={edge.d}
                    fill="none"
                    stroke={edge.stroke}
                    strokeWidth={edge.strokeWidth}
                    strokeDasharray={edge.dash ?? undefined}
                    strokeLinejoin="round"
                  />
                  {edge.flow ? (
                    <path
                      d={edge.d}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray="1 11"
                      className="animate-svc-flow motion-reduce:hidden"
                    />
                  ) : null}
                  <path d={edge.arrow} fill={edge.stroke} />
                </g>
              ))}
            </svg>

            {layout.nodes.map((node) => {
              const service = getService(node.id);
              if (!service) return null;
              const look = node.state ? NODE_LOOK[node.state] : PENDING_LOOK;
              const Icon = service.icon;
              const label = stateLabel(node.state);
              return (
                <button
                  key={node.id}
                  type="button"
                  title={node.id}
                  aria-pressed={node.selected}
                  aria-label={`${node.id}, ${label}`}
                  onClick={() => toggle(node.id)}
                  style={{ left: node.x, top: node.y, opacity: node.opacity }}
                  className={cn(
                    'absolute grid h-[60px] w-[150px] content-center gap-[7px] rounded-[10px] border px-2.5 text-left transition-[opacity,box-shadow] duration-150 hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    look.box,
                    node.selected
                      ? 'border-primary shadow-[0_0_0_3px_rgba(26,60,143,.15)]'
                      : cn(look.border, look.shadow),
                  )}
                >
                  <span className="flex min-w-0 items-center gap-[7px]">
                    <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md', look.icon)}>
                      <Icon className="h-3 w-3" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-tx-primary">
                      {node.id}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <code className="flex-1 font-mono text-[11px] text-tx-muted">{service.port}</code>
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', look.dot)} aria-hidden />
                    <span className={cn('text-[10.5px] font-semibold', look.label)}>{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-[18px] pb-3 text-[11px] text-tx-secondary">
          <LegendLine color={EDGE_COLORS.app} label="Aplicação" />
          <LegendLine color={EDGE_COLORS.metrics} label="Métricas" />
          <LegendLine color={EDGE_COLORS.idle} label="Sob demanda" dashed />
          <LegendLine color={EDGE_COLORS.fail} label="Falha" dashed />
          {lastCheckedAt ? (
            <span className="ml-auto text-tx-muted">Verificado às {formatTime(lastCheckedAt)}</span>
          ) : null}
        </div>
      </div>

      {/* Lista para leitores de tela: o mapa é visual. */}
      <ul className="sr-only" aria-label="Estado dos serviços">
        {SERVICES.map((service) => (
          <li key={service.id}>
            {service.id}: {stateLabel(statusById[service.id])}
            {messages[service.id] ? `. ${messages[service.id]}` : ''}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] items-start gap-3">
        {/* Galo Sentinela */}
        <div className="flex min-h-[150px] items-end gap-3 rounded-xl border border-border-default bg-bg-surface py-3 pl-2 pr-4">
          <img
            src={GALO_SRC[galo.pose]}
            alt="Galo Sentinela"
            width={104}
            height={136}
            className="h-[136px] w-[104px] shrink-0 object-contain object-bottom"
          />
          <div className="grid min-w-0 gap-1.5 self-center" aria-live="polite">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary dark:text-blue-300">
              Galo Sentinela
            </span>
            <p className="text-sm font-bold text-tx-primary">{galo.title}</p>
            <p className="text-[13px] leading-normal text-tx-secondary">{galo.text}</p>
          </div>
        </div>

        {/* Detalhes do serviço */}
        <div className="grid min-h-[150px] content-start gap-2.5 rounded-xl border border-border-default bg-bg-surface px-4 py-3.5">
          {selected ? (
            <ServiceDetails
              service={selected}
              statusById={statusById}
              message={messages[selected.id]}
              onSelect={setSelectedId}
              onClear={() => setSelectedId(null)}
            />
          ) : (
            <div className="grid min-h-[120px] place-items-center text-center">
              <p className="max-w-[280px] text-[13px] text-tx-muted">
                Selecione um serviço no mapa para ver dependências, portas e configuração do container.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegendLine({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn('h-0 w-3.5 border-t-2', dashed ? 'border-dashed' : 'border-solid')}
        style={{ borderColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function ServiceDetails({
  service,
  statusById,
  message,
  onSelect,
  onClear,
}: {
  service: ServiceDef;
  statusById: StatusById;
  message: string | undefined;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const { id } = service;
  const state = statusById[id];
  const look = state ? NODE_LOOK[state] : PENDING_LOOK;
  const Icon = service.icon;
  const note =
    message ??
    (state === 'demanda'
      ? `Sobe só com o perfil ${service.profile}: docker compose --profile ${service.profile} up -d ${service.id}`
      : undefined);
  const facts: Array<[string, string]> = [
    ['Container', service.container],
    ['Imagem', service.image],
    ['Portas', service.ports],
    ['Perfil', service.profile],
    ['Memória', service.mem],
    ['Health check', service.health],
  ];
  const relations: Array<[string, string[]]> = [
    ['Depende de', dependenciesOf(id)],
    ['Usado por', dependentsOf(id)],
  ];

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', look.icon)}>
          <Icon className="h-[15px] w-[15px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-tx-primary">{service.id}</p>
          <p className="text-xs text-tx-muted">{service.desc}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.04em]"
          style={
            state
              ? { background: STATE_META[state].badgeBg, color: STATE_META[state].badgeFg }
              : { background: '#f0f6ff', color: '#6b7a8d' }
          }
        >
          {stateLabel(state)}
        </span>
        <button
          type="button"
          aria-label="Limpar seleção"
          onClick={onClear}
          className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-tx-muted transition-colors hover:bg-bg-s3 hover:text-tx-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {note ? (
        <p className={cn('rounded-lg px-2.5 py-[7px] text-[12.5px]', (state && NOTE_LOOK[state]) || NOTE_LOOK.demanda)}>
          {note}
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 text-[12.5px]">
        {facts.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-tx-muted">{key}</dt>
            <dd className="break-all font-mono text-xs text-tx-primary">{value}</dd>
          </div>
        ))}
      </dl>

      {relations.map(([label, ids]) =>
        ids.length > 0 ? (
          <div key={label} className="flex flex-wrap items-center gap-[5px]">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[.1em] text-tx-muted">{label}</span>
            {ids.map((other) => {
              const otherState = statusById[other];
              return (
                <button
                  key={other}
                  type="button"
                  onClick={() => onSelect(other)}
                  className="inline-flex items-center gap-[5px] rounded-full bg-bg-s3 px-2 py-0.5 text-[11.5px] font-semibold text-primary transition-colors hover:bg-primary/[.12] dark:text-blue-300"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: otherState ? STATE_META[otherState].dot : '#9aaabb' }}
                    aria-hidden
                  />
                  {other}
                </button>
              );
            })}
          </div>
        ) : null,
      )}
    </>
  );
}
