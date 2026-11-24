import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import { useTheme } from '../../../hooks/use-theme';

// ── Color resolver ─────────────────────────────────────────────────────────

function resolveEdgeColor(
  sourceType: string,
  sourceHandleId: string | null | undefined,
  isDark: boolean,
): string {
  if (sourceType.startsWith('trigger_')) return '#00C9D4';
  if (sourceType.startsWith('condition_')) {
    if (sourceHandleId === 'yes') return '#16A34A';
    if (sourceHandleId === 'no') return '#DC2626';
    return isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  }
  // ActionNode → next node: neutral color, but it must contrast the canvas
  // background in BOTH themes — a translucent white here is invisible on
  // the light theme's near-white canvas.
  return isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
}

// ── Component ──────────────────────────────────────────────────────────────

export function CustomEdge({
  id,
  source,
  sourceHandleId,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const { getNode } = useReactFlow();
  const { isDark } = useTheme();
  const sourceNode = getNode(source);
  const sourceType = String(sourceNode?.type ?? '');

  const color = resolveEdgeColor(sourceType, sourceHandleId, isDark);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = sourceHandleId === 'yes' ? 'SIM' : sourceHandleId === 'no' ? 'NÃO' : null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: '8 4',
          animation: 'flow-edge-flowing 2s linear infinite',
          filter: `drop-shadow(0 0 4px ${color})`,
          ...style,
        }}
      />

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              padding: '2px 7px',
              borderRadius: 100,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '1px',
              fontFamily: 'ui-monospace, "Courier New", monospace',
              background: color,
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: `0 0 8px ${color}`,
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
