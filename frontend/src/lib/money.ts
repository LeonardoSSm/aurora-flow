const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.500,00" — o espaço do Intl (não separável) vira espaço comum, como no resto do sistema. */
export function formatBRL(value: number): string {
  return BRL.format(value).replace(/ /g, ' ');
}

/** Total da coluna: completo até R$ 100 mil (precisão); acima, "R$ 123,4 mil" / "R$ 1,2 mi" (cabe no topo). */
export function formatBRLCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs < 100_000) return formatBRL(value);
  const [divisor, suffix] = abs >= 1_000_000 ? [1_000_000, 'mi'] : [1000, 'mil'];
  const short = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / divisor);
  return `R$ ${short} ${suffix}`;
}
