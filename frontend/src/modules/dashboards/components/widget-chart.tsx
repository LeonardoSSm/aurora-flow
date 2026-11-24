import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type ActiveDotProps,
  type DotItemDotProps,
} from 'recharts';
import { FORMATO_PADRAO_POR_TIPO, type WidgetFormatoGrafico, type WidgetResultado } from '../types';

type WidgetChartProps = {
  resultado: WidgetResultado | null;
  erro?: string | null;
  /**
   * Altura útil do gráfico. Padrão '100%': preenche o card, que agora tem
   * altura livre na grade. Um número em px só faz sentido fora da grade, como
   * a caixa de pré-visualização do editor.
   */
  altura?: number | string;
  /** Ausente = usa o padrão do `tipo` do resultado. Sem efeito em `kpi`. */
  formatoGrafico?: WidgetFormatoGrafico;
  /** Nome de cada métrica na legenda — só aparece quando há uma segunda métrica. */
  tituloSerie1?: string;
  tituloSerie2?: string;
  /** Lado a lado (padrão) ou empilhado — só com duas métricas em barra/área. */
  empilhado?: boolean;
};

/** Paleta dos gráficos — derivada da identidade, com variação suficiente para distinguir fatias. */
const CORES = ['#1A3C8F', '#2B5DD6', '#F5A623', '#2A6B2A', '#7C3AED', '#0891B2', '#DB2777'];

function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatarDia(iso: string): string {
  const data = new Date(`${iso}T00:00:00`);
  return Number.isNaN(data.getTime())
    ? iso
    : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function DicaGrafico({
  active,
  payload,
  label,
  duasMetricas,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; color?: string }>;
  label?: string;
  /**
   * Com uma métrica só, alguns formatos (a haste "linha") combinam duas marcas
   * recharts (uma barra e uma linha invisível) para desenhar UM valor — sem
   * este sinal explícito, mostrar `payload` inteiro duplicaria essa marca. Com
   * duas métricas de verdade, cada entrada é uma medida diferente e todas
   * devem aparecer.
   */
  duasMetricas?: boolean;
}) {
  if (!active || !payload?.length) return null;
  // Linha/barra/área passam `label` (vêm de um eixo); pizza/rosca não têm eixo,
  // o rótulo da fatia chega em `payload[0].name`.
  const rotulo = label ?? payload[0].name;
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface px-3 py-2 shadow-soft">
      <p className="text-xs font-semibold text-tx-secondary">{rotulo}</p>
      {duasMetricas ? (
        <div className="grid gap-0.5">
          {payload.map((item, indice) => (
            <p
              key={item.name ?? indice}
              className="flex items-center gap-1.5 text-sm font-bold text-tx-primary"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {formatarNumero(item.value)}
              {item.name ? (
                <span className="font-medium text-tx-secondary">{item.name}</span>
              ) : null}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold text-tx-primary">{formatarNumero(payload[0].value)}</p>
      )}
    </div>
  );
}

/** Bolinha colorida por item — a ponta de cada haste no formato "linha" sem série. */
function pontoColoridoPorItem({ cx, cy, index }: DotItemDotProps) {
  if (cx === undefined || cy === undefined || index === undefined) return null;
  return <circle key={`ponto-${index}`} cx={cx} cy={cy} r={5} fill={CORES[index % CORES.length]} />;
}

function pontoColoridoAtivo({ cx, cy, index }: ActiveDotProps) {
  if (cx === undefined || cy === undefined) return null;
  return <circle key={`ponto-ativo-${index}`} cx={cx} cy={cy} r={7} fill={CORES[index % CORES.length]} />;
}

function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <Inbox className="h-7 w-7 text-tx-ph" />
      <p className="text-xs font-medium text-tx-secondary">{mensagem}</p>
    </div>
  );
}

/** Moldura comum a todo gráfico: ocupa a altura dada, sem repetir isso em cada formato. */
function Moldura({ altura, children }: { altura: number | string; children: ReactElement }) {
  return (
    <div style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Desenha o resultado de um widget conforme o formato que ele declara. */
export function WidgetChart({
  resultado,
  erro,
  altura = '100%',
  formatoGrafico,
  tituloSerie1,
  tituloSerie2,
  empilhado,
}: WidgetChartProps) {
  if (erro) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 px-4 text-center">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
        <p className="text-xs font-semibold text-tx-secondary">Não foi possível calcular</p>
        <p className="text-xs text-tx-ph">{erro}</p>
      </div>
    );
  }

  if (!resultado) return <Vazio mensagem="Sem dados" />;

  if (resultado.tipo === 'kpi') {
    // A unidade vem no resultado: quem desenha nao precisa saber a medida.
    const sufixo = resultado.unidade === 'percentual' ? '%' : resultado.unidade === 'horas' ? 'h' : '';
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <span className="text-4xl font-extrabold tracking-tight text-tx-primary">
          {resultado.valor === null ? '—' : `${formatarNumero(resultado.valor)}${sufixo}`}
        </span>
        {resultado.valor === null ? (
          // Genérico de propósito: o valor vem nulo por falta de resposta no
          // período, mas também quando não há denominador — nenhuma solicitação
          // com prazo definido, por exemplo. Nomear só um dos casos mentiria no
          // outro.
          <span className="text-xs text-tx-ph">Sem dados para calcular</span>
        ) : null}
      </div>
    );
  }

  if (resultado.pontos.length === 0) {
    return <Vazio mensagem="Nenhuma resposta no período escolhido" />;
  }

  // Série, categorias e ranking chegam todos como a mesma lista {rotulo, valor}
  // (ver WidgetResultado) — o `tipo` só decide se o rótulo é uma data a formatar.
  // Daqui pra baixo, qual desenho fazer com essa lista é escolha de exibição
  // pura, independente do tipo: o mesmo formato do Planilhas Google, onde a
  // pessoa escolhe barra/coluna/linha/área/pizza/rosca por cima do mesmo dado.
  const ehSerie = resultado.tipo === 'serie';
  const duasMetricas = resultado.pontos.some((ponto) => ponto.valor2 !== undefined);
  const dados = resultado.pontos.map((ponto) => ({
    rotulo: ehSerie ? formatarDia(ponto.rotulo) : ponto.rotulo,
    valor: ponto.valor,
    ...(ponto.valor2 !== undefined ? { valor2: ponto.valor2 } : {}),
  }));
  const nomeSerie1 = tituloSerie1 ?? 'Série 1';
  const nomeSerie2 = tituloSerie2 ?? 'Série 2';
  const formato = formatoGrafico ?? FORMATO_PADRAO_POR_TIPO[resultado.tipo];
  // A haste colorida usa a cor pra identificar a CATEGORIA (ver mais abaixo);
  // com uma segunda métrica de verdade a cor passa a identificar a MÉTRICA, e
  // aí a haste (pensada pra uma métrica só) perde o sentido — cai pra barra
  // horizontal agrupada/empilhada, o mesmo desenho usado em `categorias`/
  // `ranking` com duas métricas. `combinacao` sem segunda métrica não tem o
  // que combinar, então também cai pra um formato de uma métrica só.
  const formatoEfetivo =
    duasMetricas && formato === 'linha' && !ehSerie
      ? 'barra_horizontal'
      : formato === 'combinacao' && !duasMetricas
        ? 'barra'
        : formato;

  if (formatoEfetivo === 'combinacao') {
    return (
      <Moldura altura={altura}>
        <ComposedChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico duasMetricas />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="valor" name={nomeSerie1} fill={CORES[0]} radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Line
            type="monotone"
            dataKey="valor2"
            name={nomeSerie2}
            stroke={CORES[1]}
            strokeWidth={2}
            dot={{ r: 3, fill: CORES[1] }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'area' && duasMetricas) {
    return (
      <Moldura altura={altura}>
        <AreaChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico duasMetricas />} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="valor"
            name={nomeSerie1}
            stroke={CORES[0]}
            strokeWidth={2}
            fill={CORES[0]}
            fillOpacity={empilhado ? 0.55 : 0.18}
            stackId={empilhado ? 'pilha' : undefined}
          />
          <Area
            type="monotone"
            dataKey="valor2"
            name={nomeSerie2}
            stroke={CORES[1]}
            strokeWidth={2}
            fill={CORES[1]}
            fillOpacity={empilhado ? 0.55 : 0.18}
            stackId={empilhado ? 'pilha' : undefined}
          />
        </AreaChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'linha' && ehSerie && duasMetricas) {
    return (
      <Moldura altura={altura}>
        <LineChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico duasMetricas />} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="valor"
            name={nomeSerie1}
            stroke={CORES[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: CORES[0] }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="valor2"
            name={nomeSerie2}
            stroke={CORES[1]}
            strokeWidth={2}
            dot={{ r: 3, fill: CORES[1] }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'barra' && duasMetricas) {
    return (
      <Moldura altura={altura}>
        <BarChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico duasMetricas />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="valor"
            name={nomeSerie1}
            fill={CORES[0]}
            maxBarSize={40}
            stackId={empilhado ? 'pilha' : undefined}
            radius={empilhado ? [0, 0, 0, 0] : [4, 4, 0, 0]}
          />
          <Bar
            dataKey="valor2"
            name={nomeSerie2}
            fill={CORES[1]}
            maxBarSize={40}
            stackId={empilhado ? 'pilha' : undefined}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'barra_horizontal' && duasMetricas) {
    return (
      <Moldura altura={altura}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border-default" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="rotulo"
            width={110}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-tx-secondary"
          />
          <Tooltip content={<DicaGrafico duasMetricas />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="valor"
            name={nomeSerie1}
            fill={CORES[0]}
            maxBarSize={26}
            stackId={empilhado ? 'pilha' : undefined}
            radius={empilhado ? [0, 0, 0, 0] : [0, 4, 4, 0]}
          />
          <Bar
            dataKey="valor2"
            name={nomeSerie2}
            fill={CORES[1]}
            maxBarSize={26}
            stackId={empilhado ? 'pilha' : undefined}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'linha' && !ehSerie) {
    // "Hastes coloridas": sem uma sequência no tempo, uma linha contínua ligando
    // um item ao outro sugeriria uma tendência que não existe entre categorias
    // soltas. Em vez disso, cada item ganha sua própria haste fina (a mesma cor
    // de identidade que a coluna usa) com uma bolinha na ponta — a régua de
    // "cor por item, nunca por posição" continua valendo aqui. Deitada — de um
    // ponto à esquerda (zero) até um ponto à direita (o valor) — pelo mesmo
    // motivo da barra_horizontal: rótulo de opção costuma ser texto comprido,
    // ilegível espremido sob uma haste vertical.
    return (
      <Moldura altura={altura}>
        <ComposedChart
          data={dados}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border-default" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="rotulo"
            width={110}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            className="text-tx-secondary"
          />
          <Tooltip content={<DicaGrafico />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Bar dataKey="valor" barSize={3} radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {dados.map((ponto, indice) => (
              <Cell key={ponto.rotulo} fill={CORES[indice % CORES.length]} />
            ))}
          </Bar>
          <Line
            dataKey="valor"
            stroke="none"
            isAnimationActive={false}
            dot={pontoColoridoPorItem}
            activeDot={pontoColoridoAtivo}
          />
        </ComposedChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'linha') {
    return (
      <Moldura altura={altura}>
        <LineChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico />} />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={CORES[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: CORES[0] }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'area') {
    return (
      <Moldura altura={altura}>
        <AreaChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico />} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke={CORES[0]}
            strokeWidth={2}
            fill={CORES[0]}
            fillOpacity={0.18}
          />
        </AreaChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'pizza' || formatoEfetivo === 'rosca') {
    return (
      <Moldura altura={altura}>
        <PieChart>
          <Tooltip content={<DicaGrafico />} />
          <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: 11 }} />
          <Pie
            data={dados}
            dataKey="valor"
            nameKey="rotulo"
            cx="50%"
            cy="46%"
            outerRadius="78%"
            innerRadius={formatoEfetivo === 'rosca' ? '52%' : 0}
            paddingAngle={dados.length > 1 ? 2 : 0}
          >
            {dados.map((ponto, indice) => (
              <Cell key={ponto.rotulo} fill={CORES[indice % CORES.length]} />
            ))}
          </Pie>
        </PieChart>
      </Moldura>
    );
  }

  if (formatoEfetivo === 'barra') {
    return (
      <Moldura altura={altura}>
        <BarChart data={dados} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border-default" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" />
          <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
          <Tooltip content={<DicaGrafico />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {dados.map((ponto, indice) => (
              <Cell key={ponto.rotulo} fill={CORES[indice % CORES.length]} />
            ))}
          </Bar>
        </BarChart>
      </Moldura>
    );
  }

  // 'barra_horizontal' — rótulo de opção costuma ser longo e ilegível sob uma
  // barra vertical, por isso é o padrão de categorias e ranking.
  return (
    <Moldura altura={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border-default" />
        <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" className="text-tx-secondary" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="rotulo"
          width={110}
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          className="text-tx-secondary"
        />
        <Tooltip content={<DicaGrafico />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={26}>
          {dados.map((ponto, indice) => (
            <Cell key={ponto.rotulo} fill={CORES[indice % CORES.length]} />
          ))}
        </Bar>
      </BarChart>
    </Moldura>
  );
}
