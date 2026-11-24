import {
  ArrowDownToLine,
  Bell,
  BellRing,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  GitBranch,
  GitMerge,
  Globe,
  Link2,
  Mail,
  MessageCircle,
  Search,
  Sheet,
  Timer,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FlowNodeType } from '../types/flow.types';
import { useTheme } from '../../../hooks/use-theme';

// ── Node + category definitions ───────────────────────────────────────

type NodeDef = {
  type: FlowNodeType;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
};

type CategoryDef = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  defaultOpen: boolean;
  nodes: NodeDef[];
};

const CATEGORIES: CategoryDef[] = [
  {
    key: 'triggers',
    label: 'Gatilhos',
    Icon: Zap,
    color: '#00C9D4',
    defaultOpen: true,
    nodes: [
      {
        type: 'trigger_webhook_received',
        label: 'Webhook recebido',
        Icon: ArrowDownToLine,
        color: '#00C9D4',
      },
      {
        type: 'trigger_scheduled',
        label: 'Agendado (cron/intervalo)',
        Icon: Timer,
        color: '#00C9D4',
      },
    ],
  },
  {
    key: 'conditions',
    label: 'Condições',
    Icon: GitBranch,
    color: '#F0A500',
    defaultOpen: true,
    nodes: [
      {
        type: 'condition_always_true',
        label: 'Sempre verdadeiro',
        Icon: CheckCircle,
        color: '#F0A500',
      },
      {
        type: 'condition_response_value',
        label: 'Valor da verificação HTTP',
        Icon: GitBranch,
        color: '#F0A500',
      },
    ],
  },
  {
    key: 'communication',
    label: 'Comunicação',
    Icon: Mail,
    color: '#4F6EF7',
    defaultOpen: false,
    nodes: [
      { type: 'action_send_email', label: 'Enviar e-mail', Icon: Mail, color: '#4F6EF7' },
      { type: 'action_notification', label: 'Notificação', Icon: BellRing, color: '#4F6EF7' },
      { type: 'action_notify_users', label: 'Notificar usuários', Icon: Bell, color: '#4F6EF7' },
      {
        type: 'action_send_whatsapp',
        label: 'Enviar WhatsApp',
        Icon: MessageCircle,
        color: '#4F6EF7',
      },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrações',
    Icon: Link2,
    color: '#B06EFF',
    defaultOpen: false,
    nodes: [
      { type: 'action_webhook', label: 'Webhook', Icon: Link2, color: '#B06EFF' },
      {
        type: 'action_http_check',
        label: 'Verificação HTTP',
        Icon: Globe,
        color: '#B06EFF',
      },
      {
        type: 'action_google_sheets',
        label: 'Google Sheets',
        Icon: Sheet,
        color: '#B06EFF',
      },
      {
        type: 'action_erp_operation',
        label: 'Operação ERP',
        Icon: Database,
        color: '#B06EFF',
      },
      {
        type: 'action_ai_agent',
        label: 'Agente de IA',
        Icon: Bot,
        color: '#B06EFF',
      },
    ],
  },
  {
    key: 'flows',
    label: 'Fluxos',
    Icon: GitMerge,
    color: '#7C3AED',
    defaultOpen: false,
    nodes: [
      {
        type: 'action_run_flow',
        label: 'Chamar outro fluxo',
        Icon: GitMerge,
        color: '#7C3AED',
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: '#00C9D4', fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </strong>
      {text.slice(idx + query.length)}
    </>
  );
}

function startDrag(e: React.DragEvent, nodeType: FlowNodeType) {
  e.dataTransfer.setData('application/reactflow', nodeType);
  e.dataTransfer.effectAllowed = 'move';
}

// ── Mini shape preview ────────────────────────────────────────────────

function NodeShape({ categoryKey, color }: { categoryKey: string; color: string }) {
  if (categoryKey === 'triggers') {
    return (
      <div
        style={{
          width: 22,
          height: 11,
          borderRadius: 100,
          background: 'rgba(0,201,212,0.15)',
          border: '1px solid rgba(0,201,212,0.5)',
          flexShrink: 0,
        }}
      />
    );
  }
  if (categoryKey === 'conditions') {
    return (
      <div
        style={{
          width: 11,
          height: 11,
          background: 'rgba(240,165,0,0.15)',
          border: '1px solid rgba(240,165,0,0.5)',
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
    );
  }
  // Actions — mini card with colored left border accent
  return (
    <div
      style={{
        width: 16,
        height: 11,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderLeft: `2px solid ${color}`,
        flexShrink: 0,
      }}
    />
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function NodeItem({
  node,
  query,
  categoryKey,
}: {
  node: NodeDef;
  query: string;
  categoryKey: string;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => startDrag(e, node.type)}
      className="flex cursor-grab select-none items-center gap-2 rounded-[6px] px-2 py-1.5 active:cursor-grabbing"
      style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 500 }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.9)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.65)';
      }}
      title={`Arrastar para o canvas: ${node.label}`}
    >
      <NodeShape categoryKey={categoryKey} color={node.color} />
      <node.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: node.color }} />
      <span className="truncate">{highlightMatch(node.label, query)}</span>
    </div>
  );
}

function SearchResultItem({
  node,
  category,
  query,
}: {
  node: NodeDef;
  category: CategoryDef;
  query: string;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => startDrag(e, node.type)}
      className="flex cursor-grab select-none items-center gap-2 rounded-[6px] px-2 py-1.5 active:cursor-grabbing"
      style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 500 }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.9)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.65)';
      }}
      title={`Arrastar para o canvas: ${node.label}`}
    >
      <NodeShape categoryKey={category.key} color={node.color} />
      <node.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: node.color }} />
      <span className="min-w-0 flex-1 truncate">{highlightMatch(node.label, query)}</span>
      <span
        className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px]"
        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
      >
        {category.label}
      </span>
    </div>
  );
}

function CategorySection({
  category,
  isOpen,
  onToggle,
  query,
}: {
  category: CategoryDef;
  isOpen: boolean;
  onToggle: () => void;
  query: string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5"
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1.5px',
          color: 'rgba(255,255,255,0.38)',
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.38)';
        }}
      >
        <category.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: category.color }} />
        <span className="flex-1 text-left uppercase tracking-widest">
          {category.label}{' '}
          <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400 }}>
            ({category.nodes.length})
          </span>
        </span>
        {isOpen ? (
          <ChevronDown
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          />
        ) : (
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          />
        )}
      </button>

      <div
        style={{
          maxHeight: isOpen ? category.nodes.length * 40 + 8 : 0,
          overflow: 'hidden',
          transition: 'max-height 200ms ease-in-out',
        }}
      >
        <div className="pb-1 pl-1">
          {category.nodes.map((node) => (
            <NodeItem
              key={node.type}
              node={node}
              query={query}
              categoryKey={category.key}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

const DEFAULT_OPEN_CATEGORIES: Record<string, boolean> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.defaultOpen]),
);

const LIBRARY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.nodes.map((n) => [n.type, n.label])),
);

/** Nome do tipo de nó como aparece na biblioteca (ex.: "Enviar e-mail"). */
export function getNodeLibraryLabel(type: string): string | undefined {
  return LIBRARY_LABELS[type];
}

/** Nome do nó como aparece na biblioteca (ex.: "Aprovação concluída"). */
export function nodeLibraryLabel(type: FlowNodeType): string {
  for (const category of CATEGORIES) {
    const found = category.nodes.find((node) => node.type === type);
    if (found) return found.label;
  }
  return type;
}

/**
 * `fill`: ocupa toda a largura do contêiner, sempre aberta (lateral do mapa de processos, onde os
 * nós são arrastados para as fases). Sem ele: a coluna recolhível do editor de fluxos.
 */
export function NodeLibrary({ fill = false }: { fill?: boolean } = {}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const { isDark } = useTheme();

  const [panelOpenState, setIsPanelOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('nlib-open');
      if (saved !== null) return saved === 'true';
    } catch {}
    return window.innerWidth >= 1280;
  });
  const isPanelOpen = fill || panelOpenState;

  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('nlib-categories') ?? 'null',
      ) as Record<string, boolean> | null;
      if (saved && typeof saved === 'object') return { ...DEFAULT_OPEN_CATEGORIES, ...saved };
    } catch {}
    return { ...DEFAULT_OPEN_CATEGORIES };
  });

  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('nlib-open', String(panelOpenState));
    } catch {}
  }, [panelOpenState]);

  useEffect(() => {
    try {
      localStorage.setItem('nlib-categories', JSON.stringify(openCategories));
    } catch {}
  }, [openCategories]);

  function toggleCategory(key: string) {
    setOpenCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePanel() {
    setIsPanelOpen((v) => {
      if (!v) {
        setTimeout(() => searchRef.current?.focus(), 220);
      }
      return !v;
    });
  }

  // ── Search results ──────────────────────────────────────────────────

  const lowerQuery = query.toLowerCase().trim();
  const searchResults = lowerQuery
    ? CATEGORIES.flatMap((cat) =>
        cat.nodes
          .filter(
            (n) =>
              n.label.toLowerCase().includes(lowerQuery) ||
              cat.label.toLowerCase().includes(lowerQuery),
          )
          .map((n) => ({ node: n, category: cat })),
      )
    : [];

  const isSearching = lowerQuery.length > 0;

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <aside
      className="glass-sidebar relative flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{
        width: fill ? '100%' : isPanelOpen ? 256 : 40,
        background: isDark ? 'rgba(8,13,30,0.95)' : 'rgba(248,249,252,0.98)',
        backdropFilter: isDark ? 'blur(20px)' : 'none',
        WebkitBackdropFilter: isDark ? 'blur(20px)' : 'none',
        borderRight: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
        color: isDark ? undefined : '#0d1d29',
      }}
    >
      {/* Header row: title + toggle */}
      <div
        className="flex h-10 shrink-0 items-center"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {isPanelOpen && (
          <span
            className="flex-1 truncate pl-3"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '2px',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            BIBLIOTECA
          </span>
        )}
        {fill ? null : (
        <button
          type="button"
          onClick={togglePanel}
          title={isPanelOpen ? 'Recolher painel' : 'Expandir painel'}
          className="grid h-10 w-10 shrink-0 place-items-center transition-colors"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,201,212,0.8)';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,201,212,0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {isPanelOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        )}
      </div>

      {/* ── Expanded panel ── */}
      {isPanelOpen && (
        <>
          {/* Search */}
          <div className="shrink-0 px-2 py-2">
            <div
              className="flex items-center gap-2 rounded-[8px] px-2.5 py-1.5"
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar nó..."
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="transition-colors"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                  aria-label="Limpar busca"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)';
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {isSearching ? (
              searchResults.length > 0 ? (
                <div className="grid gap-0.5">
                  <p className="px-2 pb-1 pt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map(({ node, category }) => (
                    <SearchResultItem
                      key={node.type}
                      node={node}
                      category={category}
                      query={lowerQuery}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-2 pt-3 text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Nenhum nó para &ldquo;{query}&rdquo;
                </p>
              )
            ) : (
              <div className="grid gap-0.5 pt-0.5">
                {CATEGORIES.map((cat) => (
                  <CategorySection
                    key={cat.key}
                    category={cat}
                    isOpen={openCategories[cat.key] ?? cat.defaultOpen}
                    onToggle={() => toggleCategory(cat.key)}
                    query=""
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Collapsed panel: category icons ── */}
      {!isPanelOpen && (
        <div className="flex flex-col items-center gap-0.5 py-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              title={cat.label}
              onClick={togglePanel}
              className="grid h-9 w-9 place-items-center rounded-[6px] transition-colors"
              style={{ color: cat.color }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <cat.Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
