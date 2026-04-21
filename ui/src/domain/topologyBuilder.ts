import type {
  AssetDefinition,
  AssetType,
  BuilderEdge,
  BuilderNode,
  BuilderNodeData,
  BuilderState,
  Criticality,
  PurdueLevel,
  SecurityLevel,
} from './topologyTypes'
import { assetCatalog } from './assetCatalog'

type DevicePortPayload = {
  id: string
  name: string
}

type DevicePayload = {
  id: string
  name: string
  asset_type: AssetType
  rack_id: string
  criticality: Criticality
  manufacturer?: string
  model?: string
  firmware_version?: string
  ports: DevicePortPayload[]
}

type TopologyPayload = {
  name: string
  description?: string
  sites: Array<{ id: string; name: string }>
  rooms: Array<{ id: string; name: string; site_id: string }>
  racks: Array<{ id: string; name: string; room_id: string }>
  devices: DevicePayload[]
  cables: Array<{
    id: string
    terminations: Array<{ port_id: string }>
  }>
  interfaces: Array<{
    port_id: string
    enabled: boolean
  }>
  vlans: Array<{
    id: string
    vlan_id: number
    name: string
    assigned_interfaces: string[]
  }>
  security_zones: Array<{
    id: string
    name: string
    purdue_level: PurdueLevel
    security_level: SecurityLevel
    device_ids: string[]
  }>
  conduits: Array<{
    id: string
    name: string
    source_zone_id: string
    target_zone_id: string
    security_level: SecurityLevel
    allowed_protocols: string[]
  }>
}

const initialSettings = {
  name: 'mvp-lab-01',
  description: 'Topologia creada desde GEMEROTIC UI',
  siteName: 'Planta Principal',
  roomName: 'Cuarto Servidores',
  rackName: 'Rack Red 01',
}

const initialNodes: BuilderNode[] = [
  createNodeFromAsset(assetCatalog[0], 0, { x: 120, y: 150 }),
  createNodeFromAsset(assetCatalog[1], 0, { x: 400, y: 150 }),
  createNodeFromAsset(assetCatalog[5], 0, { x: 680, y: 80 }),
  createNodeFromAsset(assetCatalog[6], 0, { x: 680, y: 230 }),
]

const initialEdges: BuilderEdge[] = [
  { id: 'edge-router-switch', source: 'router-01', target: 'switch-01' },
  { id: 'edge-switch-plc', source: 'switch-01', target: 'plc-01' },
  { id: 'edge-switch-hmi', source: 'switch-01', target: 'hmi-01' },
]

export function createInitialBuilderState(): BuilderState {
  return {
    settings: initialSettings,
    nodes: initialNodes,
    edges: initialEdges,
  }
}

export function createNodeFromAsset(
  asset: AssetDefinition,
  index: number,
  position: { x: number; y: number },
): BuilderNode {
  const sequence = String(index + 1).padStart(2, '0')
  const id = `${asset.assetType.replace('_', '-')}-${sequence}`

  return {
    id,
    type: 'asset',
    position,
    data: {
      label: asset.label,
      assetType: asset.assetType,
      criticality: asset.criticality,
      zoneId: asset.defaultZoneId,
      zoneName: asset.defaultZoneName,
      purdueLevel: asset.purdueLevel,
      securityLevel: asset.securityLevel,
    },
  }
}

export function buildTopologyPayload(state: BuilderState): TopologyPayload {
  const topologyName = slugify(state.settings.name)
  const siteId = 'site-main'
  const roomId = 'room-main'
  const rackId = 'rack-main'
  const portMap = assignPorts(state.nodes, state.edges)
  const edgeTerminations = assignCableTerminations(state.edges, portMap)
  const zones = buildSecurityZones(state.nodes)

  return {
    name: topologyName,
    description: normalizeOptionalText(state.settings.description),
    sites: [{ id: siteId, name: sanitizeLabel(state.settings.siteName) }],
    rooms: [
      {
        id: roomId,
        name: sanitizeLabel(state.settings.roomName),
        site_id: siteId,
      },
    ],
    racks: [
      {
        id: rackId,
        name: sanitizeLabel(state.settings.rackName),
        room_id: roomId,
      },
    ],
    devices: state.nodes.map((node) => buildDevicePayload(node, rackId, portMap)),
    cables: edgeTerminations.map((termination, index) => ({
      id: `cable-${String(index + 1).padStart(3, '0')}`,
      terminations: [
        { port_id: termination.sourcePortId },
        { port_id: termination.targetPortId },
      ],
    })),
    interfaces: Array.from(portMap.values())
      .flat()
      .map((port) => ({
        port_id: port.id,
        enabled: true,
      })),
    vlans: buildVlans(Array.from(portMap.values()).flat(), state.nodes),
    security_zones: zones,
    conduits: buildConduits(state.edges, state.nodes),
  }
}

function buildDevicePayload(
  node: BuilderNode,
  rackId: string,
  portMap: Map<string, DevicePortPayload[]>,
): DevicePayload {
  const payload: DevicePayload = {
    id: slugify(node.id),
    name: sanitizeLabel(node.data.label),
    asset_type: node.data.assetType,
    rack_id: rackId,
    criticality: node.data.criticality,
    ports: portMap.get(node.id) ?? [{ id: `${node.id}:eth0`, name: 'eth0' }],
  }

  if (node.data.manufacturer) {
    payload.manufacturer = sanitizeLabel(node.data.manufacturer)
  }
  if (node.data.model) {
    payload.model = sanitizeLabel(node.data.model)
  }
  if (node.data.firmwareVersion) {
    payload.firmware_version = node.data.firmwareVersion
  }

  return payload
}

function assignPorts(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): Map<string, DevicePortPayload[]> {
  const portMap = new Map<string, DevicePortPayload[]>()
  for (const node of nodes) {
    portMap.set(node.id, [])
  }

  for (const edge of edges) {
    addPort(portMap, edge.source)
    addPort(portMap, edge.target)
  }

  for (const node of nodes) {
    const ports = portMap.get(node.id)
    if (ports !== undefined && ports.length === 0) {
      addPort(portMap, node.id)
    }
  }

  return portMap
}

function addPort(portMap: Map<string, DevicePortPayload[]>, nodeId: string): void {
  const ports = portMap.get(nodeId)
  if (ports === undefined) {
    return
  }

  const name = `eth${ports.length}`
  ports.push({
    id: `${slugify(nodeId)}:${name}`,
    name,
  })
}

function assignCableTerminations(
  edges: BuilderEdge[],
  portMap: Map<string, DevicePortPayload[]>,
): Array<{ sourcePortId: string; targetPortId: string }> {
  const cursor = new Map<string, number>()

  return edges.map((edge) => {
    const sourceIndex = cursor.get(edge.source) ?? 0
    const targetIndex = cursor.get(edge.target) ?? 0
    cursor.set(edge.source, sourceIndex + 1)
    cursor.set(edge.target, targetIndex + 1)

    return {
      sourcePortId: portMap.get(edge.source)?.[sourceIndex]?.id ?? '',
      targetPortId: portMap.get(edge.target)?.[targetIndex]?.id ?? '',
    }
  })
}

function buildVlans(
  ports: DevicePortPayload[],
  nodes: BuilderNode[],
): TopologyPayload['vlans'] {
  const portsByZone = new Map<string, string[]>()
  const zoneNames = new Map<string, string>()

  for (const node of nodes) {
    zoneNames.set(node.data.zoneId, node.data.zoneName)
    const nodePorts = ports.filter((port) => port.id.startsWith(`${node.id}:`))
    const assigned = portsByZone.get(node.data.zoneId) ?? []
    assigned.push(...nodePorts.map((port) => port.id))
    portsByZone.set(node.data.zoneId, assigned)
  }

  return Array.from(portsByZone.entries()).map(([zoneId, assigned], index) => ({
    id: `vlan-${100 + index * 10}-${slugify(zoneId)}`,
    vlan_id: 100 + index * 10,
    name: sanitizeLabel(`VLAN ${zoneNames.get(zoneId) ?? zoneId}`),
    assigned_interfaces: assigned,
  }))
}

function buildSecurityZones(nodes: BuilderNode[]): TopologyPayload['security_zones'] {
  const zoneMap = new Map<string, TopologyPayload['security_zones'][number]>()

  for (const node of nodes) {
    const zoneId = slugify(node.data.zoneId)
    const current =
      zoneMap.get(zoneId) ??
      {
        id: zoneId,
        name: sanitizeLabel(node.data.zoneName),
        purdue_level: node.data.purdueLevel,
        security_level: node.data.securityLevel,
        device_ids: [],
      }
    current.device_ids.push(slugify(node.id))
    zoneMap.set(zoneId, current)
  }

  return Array.from(zoneMap.values())
}

function buildConduits(
  edges: BuilderEdge[],
  nodes: BuilderNode[],
): TopologyPayload['conduits'] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const conduits = new Map<string, TopologyPayload['conduits'][number]>()

  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (source === undefined || target === undefined) {
      continue
    }
    if (source.data.zoneId === target.data.zoneId) {
      continue
    }

    const sourceZone = slugify(source.data.zoneId)
    const targetZone = slugify(target.data.zoneId)
    const conduitId = `conduit-${sourceZone}-to-${targetZone}`
    if (conduits.has(conduitId)) {
      continue
    }

    conduits.set(conduitId, {
      id: conduitId,
      name: sanitizeLabel(`${source.data.zoneName} to ${target.data.zoneName}`),
      source_zone_id: sourceZone,
      target_zone_id: targetZone,
      security_level: strongerSecurityLevel(
        source.data.securityLevel,
        target.data.securityLevel,
      ),
      allowed_protocols: ['HTTPS', 'OPC-UA'],
    })
  }

  return Array.from(conduits.values())
}

function strongerSecurityLevel(first: SecurityLevel, second: SecurityLevel) {
  const order: SecurityLevel[] = ['SL-0', 'SL-1', 'SL-2', 'SL-3', 'SL-4']
  return order[Math.max(order.indexOf(first), order.indexOf(second))]
}

export function updateNodeData(
  nodes: BuilderNode[],
  nodeId: string,
  patch: Partial<BuilderNodeData>,
): BuilderNode[] {
  return nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          data: {
            ...node.data,
            ...patch,
          },
        }
      : node,
  )
}

export function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'item'
}

function sanitizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 128)
}

function normalizeOptionalText(value: string): string | undefined {
  const normalized = sanitizeLabel(value)
  return normalized || undefined
}
