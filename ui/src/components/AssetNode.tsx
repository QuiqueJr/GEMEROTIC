import { Handle, Position, type NodeProps } from '@xyflow/react'

import type { BuilderNode } from '../domain/topologyTypes'
import { EquipmentGlyph } from './EquipmentGlyph'

export function AssetNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <article
      aria-label={`Nodo ${data.label}`}
      className={`asset-node asset-node--${data.assetType}`}
      data-selected={selected}
      data-view={data.activeView ?? 'physical'}
      role="button"
      tabIndex={0}
    >
      <Handle className="asset-node__handle" id="top" type="target" position={Position.Top} />
      <Handle className="asset-node__handle" id="left" type="target" position={Position.Left} />
      <Handle className="asset-node__handle" id="right" type="target" position={Position.Right} />
      <Handle className="asset-node__handle" id="bottom" type="target" position={Position.Bottom} />

      <div className="asset-node__symbol">
        <EquipmentGlyph assetType={data.assetType} size={86} />
      </div>

      <div className="asset-node__label">
        <strong>{data.label}</strong>
      </div>

      <Handle className="asset-node__handle" id="top" type="source" position={Position.Top} />
      <Handle className="asset-node__handle" id="left" type="source" position={Position.Left} />
      <Handle className="asset-node__handle" id="right" type="source" position={Position.Right} />
      <Handle className="asset-node__handle" id="bottom" type="source" position={Position.Bottom} />
    </article>
  )
}
