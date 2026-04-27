import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import type { DrawingNode as DrawingNodeType } from '../domain/drawingTypes'

export function DrawingNode({ data, selected }: NodeProps<DrawingNodeType>) {
  const style = {
    '--drawing-color': data.color,
    height: '100%',
    width: '100%',
  } as CSSProperties

  return (
    <article
      aria-label={`Dibujo ${data.label}`}
      className={`drawing-node drawing-node--${data.kind}`}
      data-selected={selected}
      role="button"
      style={style}
      tabIndex={0}
    >
      <NodeResizer
        color={data.color}
        handleClassName="drawing-node__resize-handle"
        isVisible={selected}
        lineClassName="drawing-node__resize-line"
        maxHeight={900}
        maxWidth={900}
        minHeight={44}
        minWidth={44}
        onResizeEnd={(_, params) => data.onResizeEnd?.(params.width, params.height)}
      />
      {data.kind === 'zone' ? (
        <>
          <div className="drawing-node__header">
            <span>Zona OT</span>
            <strong>{data.securityLevel ?? 'SL-2'}</strong>
          </div>
          <div className="drawing-node__body">
            <strong>{data.label}</strong>
            <span>Purdue L{data.purdueLevel ?? 2}</span>
          </div>
        </>
      ) : (
        <div className="drawing-node__body">
          <strong>{data.label}</strong>
        </div>
      )}
    </article>
  )
}
