import { Handle, Position, type NodeProps } from '@xyflow/react'

import type { BuilderNode } from '../domain/topologyTypes'
import { EquipmentGlyph } from './EquipmentGlyph'

export function AssetNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <article
      className={`asset-node asset-node--${data.assetType}`}
      data-criticality={data.criticality}
      data-selected={selected}
      data-view={data.activeView ?? 'physical'}
    >
      <Handle className="asset-node__handle" type="target" position={Position.Top} />
      <Handle className="asset-node__handle" type="target" position={Position.Left} />

      <div className="asset-node__symbol">
        <div className="asset-node__plinth" aria-hidden="true" />
        <div className="asset-node__icon-shell">
          <EquipmentGlyph assetType={data.assetType} size={56} />
        </div>
      </div>

      <div className="asset-node__label">
        <strong>{data.label}</strong>
        <small>{data.assetType.replace('_', ' ')}</small>
      </div>

      {selected ? (
        <span className="asset-node__hint">Doble clic para configurar</span>
      ) : null}

      <Handle className="asset-node__handle" type="source" position={Position.Right} />
      <Handle className="asset-node__handle" type="source" position={Position.Bottom} />
    </article>
  )
}
