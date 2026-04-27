import type { NodeProps } from '@xyflow/react'
import type { CSSProperties } from 'react'

import type { DrawingNode as DrawingNodeType } from '../domain/drawingTypes'

export function DrawingNode({ data, selected }: NodeProps<DrawingNodeType>) {
  const style = {
    '--drawing-color': data.color,
    height: `${data.height}px`,
    width: `${data.width}px`,
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
