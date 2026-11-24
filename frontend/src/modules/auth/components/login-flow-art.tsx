import { usePrefersReducedMotion } from '../../../hooks/use-reduced-motion';

/**
 * Arte de fluxo das telas de autenticacao: rotas curvas saem de tras da marca e
 * pontos as percorrem de dentro para fora.
 *
 * Dois desenhos, porque as duas telas tem formatos muito diferentes:
 *
 * - `field` (lg+): tela inteira, marca a 25% da largura. Angulos e alcances sao
 *   irregulares de proposito — com ângulos iguais e todas as pontas no mesmo
 *   raio, o desenho vira uma flor simetrica e o resto do fundo fica vazio.
 *   Duas rotas vao longe e puxam a composicao para a direita; duas ficam curtas
 *   perto da borda esquerda. Uma poeira de estrelas cobre o resto da tela.
 * - `cluster` (abaixo de lg): bloco compacto centrado na marca, que e onde o
 *   cartao deixa espaco no celular.
 */

const AMBER = '#F5A623';

type Point = readonly [number, number];

type RouteSpec = {
  /** graus, 0 = direita, 90 = baixo */
  angle: number;
  /** distancia do ponto onde a rota nasce, ja fora do bloco da marca */
  start: number;
  fork: number;
  /** alcance de cada ponta; a primeira e a acesa */
  tips: readonly [number, number];
  spread: number;
  bend: number;
  /** duracao e atraso do ponto viajante — irregulares, nunca sincronizam */
  dur: number;
  begin: number;
};

type Layout = {
  w: number;
  h: number;
  hub: Point;
  /** achatamento do circulo: o cluster vive num retangulo alto */
  fx: number;
  fy: number;
  fit: 'meet' | 'slice';
  routes: readonly RouteSpec[];
  /** poeira de fundo: [x, y, raio] */
  dust: readonly (readonly [number, number, number])[];
  /** ligacoes fracas entre pontos distantes */
  threads: readonly (readonly [Point, Point])[];
};

const FIELD: Layout = {
  w: 1440,
  h: 900,
  hub: [360, 450],
  fx: 1,
  fy: 1,
  fit: 'slice',
  routes: [
    { angle: -105, start: 175, fork: 300, tips: [430, 360], spread: 24, bend: 34, dur: 7.2, begin: -1.4 },
    { angle: -38, start: 180, fork: 330, tips: [560, 450], spread: 20, bend: -46, dur: 10.4, begin: -6.8 },
    { angle: 22, start: 180, fork: 320, tips: [520, 420], spread: 26, bend: 40, dur: 9.6, begin: -3.9 },
    { angle: 96, start: 175, fork: 280, tips: [420, 350], spread: 30, bend: -30, dur: 8.1, begin: -0.6 },
    { angle: 158, start: 175, fork: 250, tips: [355, 300], spread: 22, bend: 26, dur: 6.4, begin: -5.5 },
    { angle: -158, start: 175, fork: 255, tips: [360, 305], spread: 26, bend: -28, dur: 7.7, begin: -2.1 },
  ],
  dust: [
    [95, 120, 2.2], [232, 62, 1.7], [612, 96, 2], [742, 232, 1.6], [880, 118, 2.2],
    [1042, 300, 1.8], [1180, 168, 2], [1338, 268, 1.7], [1268, 560, 2.1], [1108, 700, 1.7],
    [960, 828, 2], [742, 760, 1.8], [560, 858, 1.7], [128, 792, 2.1], [46, 636, 1.6],
    [1390, 792, 1.8], [1016, 486, 1.6], [660, 470, 1.5],
  ],
  threads: [
    [[880, 118], [1042, 300]],
    [[1042, 300], [1180, 168]],
    [[1268, 560], [1108, 700]],
    [[742, 760], [560, 858]],
    [[95, 120], [232, 62]],
  ],
};

const CLUSTER: Layout = {
  w: 380,
  h: 448,
  hub: [190, 224],
  fx: 0.66,
  fy: 0.72,
  fit: 'meet',
  routes: [
    { angle: 45, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: 26, dur: 7.2, begin: -1.4 },
    { angle: 90, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: -26, dur: 9.4, begin: -6.8 },
    { angle: 135, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: 26, dur: 6.3, begin: -3.9 },
    { angle: 225, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: -26, dur: 8.6, begin: -0.6 },
    { angle: 270, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: 26, dur: 7.9, begin: -5.5 },
    { angle: 315, start: 100, fork: 188, tips: [252, 258], spread: 26, bend: -26, dur: 9.8, begin: -2.1 },
  ],
  dust: [],
  threads: [],
};

const LAYOUTS: Record<'field' | 'cluster', Layout> = { field: FIELD, cluster: CLUSTER };

/** Apenas o comando Q, para encadear trechos curvos num path unico. */
const qTo = (from: Point, to: Point, bend: number): string => {
  const mx = Math.round((from[0] + to[0]) / 2 + bend);
  const my = Math.round((from[1] + to[1]) / 2 - bend * 0.6);
  return `Q${mx} ${my} ${to[0]} ${to[1]}`;
};

function buildRoutes(layout: Layout) {
  const pol = (deg: number, r: number): Point => [
    Math.round(layout.hub[0] + Math.cos((deg * Math.PI) / 180) * r * layout.fx),
    Math.round(layout.hub[1] + Math.sin((deg * Math.PI) / 180) * r * layout.fy),
  ];

  return layout.routes.map((spec) => {
    const start = pol(spec.angle, spec.start);
    const fork = pol(spec.angle, spec.fork);
    const mainTip = pol(spec.angle - spec.spread, spec.tips[0]);
    const quietTip = pol(spec.angle + spec.spread, spec.tips[1]);
    const stem = `M${start[0]} ${start[1]} ${qTo(start, fork, spec.bend * 0.5)}`;

    return {
      spec,
      fork,
      mainTip,
      quietTip,
      mainPath: `${stem} ${qTo(fork, mainTip, spec.bend)}`,
      quietPath: `${stem} ${qTo(fork, quietTip, -spec.bend * 0.7)}`,
    };
  });
}

/** Os pontos nascem e morrem em opacidade — nao aparecem nem somem cortados. */
function Traveler({ path, dur, begin }: { path: string; dur: number; begin: number }) {
  return (
    <circle r={3} fill="#ffffff">
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} />
      <animate
        attributeName="opacity"
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
        values="0;1;1;0.9;0"
        keyTimes="0;0.12;0.7;0.9;1"
      />
    </circle>
  );
}

export function LoginFlowArt({
  layout = 'cluster',
  className,
}: {
  layout?: 'field' | 'cluster';
  className?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const config = LAYOUTS[layout];
  const routes = buildRoutes(config);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${config.w} ${config.h}`}
      preserveAspectRatio={`xMidYMid ${config.fit}`}
      fill="none"
      aria-hidden
    >
      {config.threads.map(([a, b]) => (
        <line
          key={`thread-${a[0]}-${a[1]}-${b[0]}-${b[1]}`}
          x1={a[0]}
          y1={a[1]}
          x2={b[0]}
          y2={b[1]}
          stroke="rgba(255,255,255,.06)"
          strokeWidth={1}
        />
      ))}

      {config.dust.map(([x, y, r], index) => (
        <circle
          key={`dust-${x}-${y}`}
          cx={x}
          cy={y}
          r={r}
          fill="rgba(255,255,255,.28)"
          className="login-node"
          style={{ animationDelay: `${(index % 5) * 0.8}s` }}
        />
      ))}

      {routes.map((route) => (
        <g key={`lines-${route.fork[0]}-${route.fork[1]}`}>
          <path d={route.mainPath} stroke="rgba(255,255,255,.15)" strokeWidth={1.5} strokeLinecap="round" />
          <path d={route.quietPath} stroke="rgba(255,255,255,.09)" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      ))}

      {routes.map((route, index) => (
        <g key={`nodes-${route.fork[0]}-${route.fork[1]}`}>
          <circle cx={route.fork[0]} cy={route.fork[1]} r={2.4} fill="rgba(255,255,255,.35)" />
          <circle cx={route.quietTip[0]} cy={route.quietTip[1]} r={2.6} fill="rgba(255,255,255,.3)" />
          <circle cx={route.mainTip[0]} cy={route.mainTip[1]} r={10} fill={AMBER} opacity={0.13} />
          <circle
            cx={route.mainTip[0]}
            cy={route.mainTip[1]}
            r={4.6}
            fill={AMBER}
            className="login-node"
            style={{ animationDelay: `${index * 0.6}s` }}
          />
        </g>
      ))}

      {prefersReducedMotion
        ? null
        : routes.map((route) => (
            <Traveler
              key={`traveler-${route.mainTip[0]}-${route.mainTip[1]}`}
              path={route.mainPath}
              dur={route.spec.dur}
              begin={route.spec.begin}
            />
          ))}
    </svg>
  );
}
