import { Handle, Position, type NodeProps } from '@xyflow/react'

import type { BuilderNode } from '../domain/topologyTypes'
import { EquipmentGlyph } from './EquipmentGlyph'

export function AssetNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <article
      className={`asset-node asset-node--${data.assetType}`}
      data-selected={selected}
      data-view={data.activeView ?? 'physical'}
    >
      <Handle className="asset-node__handle" type="target" position={Position.Top} />
      <Handle className="asset-node__handle" type="target" position={Position.Left} />

      <div className="asset-node__symbol">
        <EquipmentGlyph assetType={data.assetType} size={78} />
      </div>

      <div className="asset-node__label">
        <strong>{data.label}</strong>
      </div>

      <Handle className="asset-node__handle" type="source" position={Position.Right} />
      <Handle className="asset-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}
