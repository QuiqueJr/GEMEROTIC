import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Cpu, Monitor, RadioTower, Router, Server, Shield, Wifi } from 'lucide-react'

import type { BuilderNode } from '../domain/topologyTypes'

const iconByAssetType = {
  router: Router,
  switch: RadioTower,
  firewall: Shield,
  host: Monitor,
  server: Server,
  plc: Cpu,
  hmi: Monitor,
  rtu: RadioTower,
  scada_server: Server,
  patch_panel: RadioTower,
  wireless_ap: Wifi,
}

export function AssetNode({ data, selected }: NodeProps<BuilderNode>) {
  const Icon = iconByAssetType[data.assetType]

  return (
    <article
      className={`asset-node asset-node--${data.assetType}`}
      data-criticality={data.criticality}
      data-selected={selected}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />
      <div className="asset-node__icon">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="asset-node__body">
        <strong>{data.label}</strong>
        <span>{data.assetType.replace('_', ' ')} - Purdue {data.purdueLevel}</span>
        <small>{data.zoneName}</small>
      </div>
      <div className="asset-node__badges">
        <span>{data.securityLevel}</span>
        <small>{data.criticality}</small>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </article>
  )
}
