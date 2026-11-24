/**
 * Aviso na aba do navegador: "(3) Título" e uma bolinha vermelha no ícone, enquanto a pessoa não
 * está olhando para a aba. Some quando ela volta.
 */

let unseen = 0;
let baseTitle: string | null = null;
let baseIcon: { href: string; type: string } | null = null;
let badgedIcon: string | null = null;

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

export function isTabAttended(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus();
}

export function formatAlertTitle(count: number, title: string): string {
  return count > 0 ? `(${count > 99 ? '99+' : count}) ${title}` : title;
}

/** Desenha a bolinha sobre o ícone atual; `null` se o navegador não deixar (sem canvas). */
async function drawBadgedIcon(href: string): Promise<string | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = href;
  try {
    await image.decode();
  } catch {
    return null;
  }
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, size, size);
  context.beginPath();
  context.arc(size - 16, 16, 15, 0, Math.PI * 2);
  context.fillStyle = '#DC2626';
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = '#FFFFFF';
  context.stroke();
  return canvas.toDataURL('image/png');
}

async function applyIcon(): Promise<void> {
  const link = iconLink();
  if (!link) return;
  baseIcon ??= { href: link.href, type: link.type };
  badgedIcon ??= await drawBadgedIcon(baseIcon.href);
  if (!badgedIcon || unseen === 0) return;
  link.type = 'image/png';
  link.href = badgedIcon;
}

function restoreIcon(): void {
  const link = iconLink();
  if (!link || !baseIcon) return;
  link.href = baseIcon.href;
  link.type = baseIcon.type;
}

/** Mais uma solicitação nova que a pessoa ainda não viu. */
export function bumpTabAlert(): void {
  if (unseen === 0) baseTitle = document.title;
  unseen += 1;
  document.title = formatAlertTitle(unseen, baseTitle ?? document.title);
  void applyIcon();
}

export function clearTabAlert(): void {
  if (unseen === 0) return;
  unseen = 0;
  if (baseTitle !== null) document.title = baseTitle;
  baseTitle = null;
  restoreIcon();
}
