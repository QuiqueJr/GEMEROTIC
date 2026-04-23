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
      data-view={data.activeView ?? 'physical'}
    >
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} />
      <div className="asset-node__icon">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="asset-node__body">
        <strong>{data.label}</strong>
        <span>{getNodePrimaryLine(data)}</span>
        <small>{getNodeSecondaryLine(data)}</small>
      </div>
      <div className="asset-node__badges">
        <span>{getNodeBadge(data)}</span>
        <small>{data.criticality}</small>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </article>
  )
}

function getNodePrimaryLine(data: BuilderNode['data']): string {
  if (data.activeView === 'logical') {
    return `VLAN ${data.vlanId} - ${data.portCount} puertos`
  }
  if (data.activeView === 'security') {
    return `${data.securityLevel} - Purdue L${data.purdueLevel}`
  }
  return `${data.assetType.replace('_', ' ')} - ${data.portPrefix}0`
}

function getNodeSecondaryLine(data: BuilderNode['data']): string {
  if (data.activeView === 'logical') {
    return data.ipv4Address || data.ipv6Address || data.vlanName
  }
  if (data.activeView === 'security') {
    return data.allowedProtocols.join(', ') || data.zoneName
  }
  return data.model || data.zoneName
}

function getNodeBadge(data: BuilderNode['data']): string {
  if (data.activeView === 'logical') {
    return data.enabled ? 'UP' : 'DOWN'
  }
  if (data.activeView === 'security') {
    return data.securityLevel
  }
  return `L${data.purdueLevel}`
}
