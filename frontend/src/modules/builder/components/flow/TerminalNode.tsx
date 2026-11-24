import { Handle, Position } from '@xyflow/react';
import { CheckCircle2 } from 'lucide-react';
import { useSectionFlowActions } from './section-flow-actions';

export function TerminalNode() {
  const label = useSectionFlowActions()?.terminalLabel ?? 'Enviar resposta';
  return (
    <div className="flex items-center gap-2 rounded-full border-[1.5px] border-[#16A34A] bg-[#f0fdf4] px-4 py-2.5 shadow-soft">
      <Handle type="target" position={Position.Left} />
      <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
      <span className="text-sm font-bold text-[#16A34A]">{label}</span>
    </div>
  );
}
