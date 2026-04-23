import type { Edge, Node } from '@xyflow/react'

export type AssetType =
  | 'router'
  | 'switch'
  | 'firewall'
  | 'host'
  | 'server'
  | 'plc'
  | 'hmi'
  | 'rtu'
  | 'scada_server'
  | 'patch_panel'
  | 'wireless_ap'

export type Criticality = 'critical' | 'high' | 'medium' | 'low'
export type SecurityLevel = 'SL-0' | 'SL-1' | 'SL-2' | 'SL-3' | 'SL-4'
export type PurdueLevel = 0 | 1 | 2 | 3 | 4 | 5
export type TopologyView = 'physical' | 'logical' | 'security'

export type BuilderNodeData = {
  label: string
  assetType: AssetType
  criticality: Criticality
  rackPosition?: number
  portCount: number
  portPrefix: string
  zoneId: string
  zoneName: string
  purdueLevel: PurdueLevel
  securityLevel: SecurityLevel
  manufacturer?: string
  model?: string
  firmwareVersion?: string
  serialNumber?: string
  vlanId: number
  vlanName: string
  ipv4Address?: string
  ipv6Address?: string
  macAddress?: string
  mgmtOnly: boolean
  enabled: boolean
  allowedProtocols: string[]
  activeView?: TopologyView
}

export type BuilderNode = Node<BuilderNodeData, 'asset'>
export type BuilderEdgeData = {
  label: string
  sourcePortIndex: number
  targetPortIndex: number
}

export type BuilderEdge = Edge<BuilderEdgeData>

export type TopologySettings = {
  name: string
  description: string
  siteName: string
  roomName: string
  rackName: string
}

export type BuilderState = {
  settings: TopologySettings
  nodes: BuilderNode[]
  edges: BuilderEdge[]
}

export type AssetDefinition = {
  assetType: AssetType
  label: string
  shortLabel: string
  role: 'network' | 'compute' | 'ot' | 'security'
  defaultZoneId: string
  defaultZoneName: string
  purdueLevel: PurdueLevel
  securityLevel: SecurityLevel
  criticality: Criticality
  portCount: number
  portPrefix: string
  vlanId: number
  vlanName: string
  defaultProtocols: string[]
}
