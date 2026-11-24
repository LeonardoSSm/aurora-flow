import {
  Briefcase,
  Building2,
  Calendar,
  Car,
  ClipboardList,
  DollarSign,
  Factory,
  FileText,
  GraduationCap,
  Headphones,
  HeartPulse,
  Laptop,
  Leaf,
  type LucideIcon,
  Megaphone,
  Package,
  Plane,
  Receipt,
  Shield,
  ShoppingCart,
  Truck,
  UserPlus,
  Users,
  Utensils,
  Wrench,
} from 'lucide-react';
import type { FormAppearance } from '../../forms/types';

/** Cores oferecidas para o card do processo (o backend aceita qualquer #RRGGBB). */
export const PROCESS_COLORS = [
  { value: '#1A3C8F', label: 'Azul' },
  { value: '#0891B2', label: 'Ciano' },
  { value: '#16A34A', label: 'Verde' },
  { value: '#65A30D', label: 'Lima' },
  { value: '#D97706', label: 'Âmbar' },
  { value: '#EA580C', label: 'Laranja' },
  { value: '#DC2626', label: 'Vermelho' },
  { value: '#DB2777', label: 'Rosa' },
  { value: '#7C3AED', label: 'Roxo' },
  { value: '#475569', label: 'Cinza' },
] as const;

/** Ícones oferecidos; a chave é o que vai para o backend. */
export const PROCESS_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  'file-text': { icon: FileText, label: 'Documento' },
  'clipboard-list': { icon: ClipboardList, label: 'Lista' },
  'shopping-cart': { icon: ShoppingCart, label: 'Compras' },
  package: { icon: Package, label: 'Pacote' },
  truck: { icon: Truck, label: 'Entrega' },
  receipt: { icon: Receipt, label: 'Nota' },
  'dollar-sign': { icon: DollarSign, label: 'Dinheiro' },
  briefcase: { icon: Briefcase, label: 'Trabalho' },
  users: { icon: Users, label: 'Equipe' },
  'user-plus': { icon: UserPlus, label: 'Contratação' },
  'graduation-cap': { icon: GraduationCap, label: 'Treinamento' },
  calendar: { icon: Calendar, label: 'Agenda' },
  plane: { icon: Plane, label: 'Viagem' },
  car: { icon: Car, label: 'Veículo' },
  wrench: { icon: Wrench, label: 'Manutenção' },
  factory: { icon: Factory, label: 'Fábrica' },
  laptop: { icon: Laptop, label: 'TI' },
  headphones: { icon: Headphones, label: 'Atendimento' },
  shield: { icon: Shield, label: 'Segurança' },
  'heart-pulse': { icon: HeartPulse, label: 'Saúde' },
  megaphone: { icon: Megaphone, label: 'Comunicação' },
  'building-2': { icon: Building2, label: 'Empresa' },
  utensils: { icon: Utensils, label: 'Refeição' },
  leaf: { icon: Leaf, label: 'Meio ambiente' },
};

export const DEFAULT_PROCESS_COLOR = PROCESS_COLORS[0].value;
export const DEFAULT_PROCESS_ICON = 'file-text';

/** Cor e ícone para desenhar o card, com os padrões no lugar do que não foi escolhido. */
export function resolveAppearance(appearance: FormAppearance | null | undefined): {
  color: string;
  Icon: LucideIcon;
} {
  const color = appearance?.color ?? DEFAULT_PROCESS_COLOR;
  const Icon = PROCESS_ICONS[appearance?.icon ?? '']?.icon ?? PROCESS_ICONS[DEFAULT_PROCESS_ICON].icon;
  return { color, Icon };
}
