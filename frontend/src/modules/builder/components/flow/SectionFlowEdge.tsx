import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { SECTION_EDGE_COLORS, type SectionFlowEdgeData } from '../../lib/section-flow-layout';

export function SectionFlowEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const edgeData = data as SectionFlowEdgeData | undefined;
  const kind = edgeData?.kind ?? 'default';
  const color = SECTION_EDGE_COLORS[kind];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: kind === 'rule' ? 2.6 : 2, ...style }}
      />
      {edgeData?.label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <span
              className="rounded-full border px-2.5 py-[3px] text-[13px] font-bold"
              style={{
                background: kind === 'rule' ? '#fff3d6' : '#f1f5f9',
                borderColor: color,
                color: kind === 'rule' ? '#8a5a00' : '#475569',
              }}
            >
              {edgeData.label}
            </span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
