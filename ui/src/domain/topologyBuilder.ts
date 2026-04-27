import type {
  AssetDefinition,
  AssetType,
  BuilderEdge,
  BuilderEdgeData,
  BuilderNode,
  BuilderNodeData,
  BuilderPortConfig,
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
  rack_position?: number
  criticality: Criticality
  manufacturer?: string
  model?: string
  firmware_version?: string
  serial_number?: string
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
    mac_address?: string
    ipv4_address?: string
    ipv6_address?: string
    mgmt_only: boolean
    enabled: boolean
    description?: string
  }>
  vlans: Array<{
    id: string
    vlan_id: number
    name: string
    description?: string
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
    description?: string
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
  createBuilderEdge({
    id: 'edge-router-switch',
    source: 'router-01',
    target: 'switch-01',
    label: 'uplink-core',
    sourcePortIndex: 0,
    targetPortIndex: 0,
  }),
  createBuilderEdge({
    id: 'edge-switch-plc',
    source: 'switch-01',
    target: 'plc-01',
    label: 'plc-a',
    sourcePortIndex: 1,
    targetPortIndex: 0,
  }),
  createBuilderEdge({
    id: 'edge-switch-hmi',
    source: 'switch-01',
    target: 'hmi-01',
    label: 'hmi-a',
    sourcePortIndex: 2,
    targetPortIndex: 0,
  }),
]

export function createInitialBuilderState(): BuilderState {
  return {
    settings: { ...initialSettings },
    nodes: initialNodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        allowedProtocols: [...node.data.allowedProtocols],
        portConfigs: node.data.portConfigs.map((portConfig) => ({ ...portConfig })),
      },
    })),
    edges: initialEdges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : undefined,
    })),
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
      portCount: asset.portCount,
      portPrefix: asset.portPrefix,
      zoneId: asset.defaultZoneId,
      zoneName: asset.defaultZoneName,
      purdueLevel: asset.purdueLevel,
      securityLevel: asset.securityLevel,
      vlanId: asset.vlanId,
      vlanName: asset.vlanName,
      mgmtOnly: false,
      enabled: true,
      portConfigs: createDefaultPortConfigs(asset.portCount),
      allowedProtocols: asset.defaultProtocols,
    },
  }
}

export function createBuilderEdge(input: {
  id: string
  source: string
  target: string
  label?: string
  routeOffset?: number
  sourcePortIndex?: number
  targetPortIndex?: number
}): BuilderEdge {
  return {
    id: input.id,
    source: input.source,
    target: input.target,
    label: normalizeCableLabel(input.label, input.id),
    data: {
      label: normalizeCableLabel(input.label, input.id),
      sourcePortIndex: normalizePortIndex(input.sourcePortIndex),
      targetPortIndex: normalizePortIndex(input.targetPortIndex),
      routeOffset: normalizeRouteOffset(input.routeOffset),
    },
  }
}

export function getNextAssetIndex(
  nodes: BuilderNode[],
  assetType: AssetType,
): number {
  const prefix = assetType.replace('_', '-')
  const usedIndexes = nodes
    .map((node) => {
      const match = node.id.match(new RegExp(`^${prefix}-(\\d+)$`))
      return match ? Number(match[1]) : 0
    })
    .filter((index) => index > 0)

  return Math.max(0, ...usedIndexes)
}

export function buildTopologyPayload(state: BuilderState): TopologyPayload {
  const topologyName = slugify(state.settings.name)
  const siteId = 'site-main'
  const roomId = 'room-main'
  const rackId = 'rack-main'
  const portMap = assignPorts(state.nodes, state.edges)
  const edgeTerminations = assignCableTerminations(state.edges, portMap)
  const zones = buildSecurityZones(state.nodes)
  const cableIds = new Set<string>()

  return {
    name: topologyName,
    description: normalizeOptionalText(state.settings.description),
    sites: [
      {
        id: siteId,
        name: normalizeLabel(state.settings.siteName, 'Planta Principal'),
      },
    ],
    rooms: [
      {
        id: roomId,
        name: normalizeLabel(state.settings.roomName, 'Cuarto Servidores'),
        site_id: siteId,
      },
    ],
    racks: [
      {
        id: rackId,
        name: normalizeLabel(state.settings.rackName, 'Rack Red 01'),
        room_id: roomId,
      },
    ],
    devices: state.nodes.map((node) => buildDevicePayload(node, rackId, portMap)),
    cables: edgeTerminations.map((termination, index) => {
      const label = normalizeCableLabel(
        termination.edge.data?.label,
        `cable-${index + 1}`,
      )
      return {
        id: createUniqueCableId(cableIds, label, index),
        terminations: [
          { port_id: termination.sourcePortId },
          { port_id: termination.targetPortId },
        ],
      }
    }),
    interfaces: buildInterfaces(portMap, state.nodes),
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
    name: normalizeLabel(node.data.label, node.id),
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
  if (node.data.serialNumber) {
    payload.serial_number = sanitizeLabel(node.data.serialNumber)
  }
  const rackPosition = normalizeRackPosition(node.data.rackPosition)
  if (rackPosition !== undefined) {
    payload.rack_position = rackPosition
  }

  return payload
}

function assignPorts(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
): Map<string, DevicePortPayload[]> {
  const portMap = new Map<string, DevicePortPayload[]>()
  const requiredPorts = new Map<string, number>()
  for (const edge of edges) {
    const sourcePortIndex = normalizePortIndex(edge.data?.sourcePortIndex)
    const targetPortIndex = normalizePortIndex(edge.data?.targetPortIndex)
    requiredPorts.set(
      edge.source,
      Math.max(requiredPorts.get(edge.source) ?? 1, sourcePortIndex + 1),
    )
    requiredPorts.set(
      edge.target,
      Math.max(requiredPorts.get(edge.target) ?? 1, targetPortIndex + 1),
    )
  }

  for (const node of nodes) {
    const configuredCount = clampPortCount(node.data.portCount)
    const requiredCount = requiredPorts.get(node.id) ?? 1
    const portCount = Math.max(configuredCount, requiredCount)
    const portPrefix = sanitizePortPrefix(node.data.portPrefix)
    portMap.set(
      node.id,
      Array.from({ length: portCount }, (_, index) => {
        const name = `${portPrefix}${index}`
        return {
          id: `${slugify(node.id)}:${name}`,
          name,
        }
      }),
    )
  }

  return portMap
}

function assignCableTerminations(
  edges: BuilderEdge[],
  portMap: Map<string, DevicePortPayload[]>,
): Array<{ edge: BuilderEdge; sourcePortId: string; targetPortId: string }> {
  return edges.map((edge) => {
    const sourceIndex = normalizePortIndex(edge.data?.sourcePortIndex)
    const targetIndex = normalizePortIndex(edge.data?.targetPortIndex)
    return {
      edge,
      sourcePortId: portMap.get(edge.source)?.[sourceIndex]?.id ?? '',
      targetPortId: portMap.get(edge.target)?.[targetIndex]?.id ?? '',
    }
  })
}

function buildInterfaces(
  portMap: Map<string, DevicePortPayload[]>,
  nodes: BuilderNode[],
): TopologyPayload['interfaces'] {
  return nodes.flatMap((node) => {
    const ports = portMap.get(node.id) ?? []
    const portConfigs = reconcilePortConfigs(node.data.portConfigs, node.data.portCount)
    return ports.map((port, index) => {
      const portConfig = portConfigs[index] ?? createDefaultPortConfig()
      const isPrimaryPort = index === 0
      const payload: TopologyPayload['interfaces'][number] = {
        port_id: port.id,
        mgmt_only: isPrimaryPort ? node.data.mgmtOnly || portConfig.mgmtOnly : portConfig.mgmtOnly,
        enabled: isPrimaryPort ? node.data.enabled && portConfig.enabled : portConfig.enabled,
        description:
          sanitizeLabel(portConfig.description ?? '') ||
          sanitizeLabel(
            `${node.data.label} ${port.name} VLAN ${normalizeVlanId(node.data.vlanId)}`,
          ),
      }

      const macAddress = portConfig.macAddress ?? (index === 0 ? node.data.macAddress : undefined)
      const ipv4Address =
        portConfig.ipv4Address ?? (index === 0 ? node.data.ipv4Address : undefined)
      const ipv6Address =
        portConfig.ipv6Address ?? (index === 0 ? node.data.ipv6Address : undefined)

      if (macAddress) {
        payload.mac_address = macAddress
      }
      if (ipv4Address) {
        payload.ipv4_address = ipv4Address
      }
      if (ipv6Address) {
        payload.ipv6_address = ipv6Address
      }

      return payload
    })
  })
}

function buildVlans(
  ports: DevicePortPayload[],
  nodes: BuilderNode[],
): TopologyPayload['vlans'] {
  const portsByVlan = new Map<number, string[]>()
  const vlanNames = new Map<number, string>()
  const vlanZones = new Map<number, string>()

  for (const node of nodes) {
    const vlanId = normalizeVlanId(node.data.vlanId)
    const nodePorts = ports.filter((port) => port.id.startsWith(`${node.id}:`))
    const assigned = portsByVlan.get(vlanId) ?? []
    assigned.push(...nodePorts.map((port) => port.id))
    portsByVlan.set(vlanId, assigned)
    vlanNames.set(vlanId, node.data.vlanName)
    vlanZones.set(vlanId, node.data.zoneName)
  }

  return Array.from(portsByVlan.entries()).map(([vlanId, assigned]) => ({
    id: `vlan-${vlanId}-${slugify(vlanNames.get(vlanId) ?? `vlan-${vlanId}`)}`,
    vlan_id: vlanId,
    name: normalizeLabel(vlanNames.get(vlanId) ?? '', `VLAN ${vlanId}`),
    description: sanitizeLabel(`Zona ${vlanZones.get(vlanId) ?? 'sin zona'}`),
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
        name: normalizeLabel(node.data.zoneName, zoneId),
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
      name: normalizeLabel(
        `${source.data.zoneName} to ${target.data.zoneName}`,
        conduitId,
      ),
      source_zone_id: sourceZone,
      target_zone_id: targetZone,
      security_level: strongerSecurityLevel(
        source.data.securityLevel,
        target.data.securityLevel,
      ),
      allowed_protocols: mergeProtocols(
        source.data.allowedProtocols,
        target.data.allowedProtocols,
      ),
      description: sanitizeLabel(
        `Conducto generado por enlace ${source.data.label} - ${target.data.label}`,
      ),
    })
  }

  return Array.from(conduits.values())
}

function strongerSecurityLevel(first: SecurityLevel, second: SecurityLevel) {
  const order: SecurityLevel[] = ['SL-0', 'SL-1', 'SL-2', 'SL-3', 'SL-4']
  return order[Math.max(order.indexOf(first), order.indexOf(second))]
}

function mergeProtocols(first: string[], second: string[]): string[] {
  const protocols = [...first, ...second]
    .map((protocol) => sanitizeProtocol(protocol))
    .filter(Boolean)
  return Array.from(new Set(protocols))
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
            ...buildNormalizedNodeData({
              ...node.data,
              ...patch,
            }),
          },
        }
      : node,
  )
}

export function updatePortConfig(
  nodes: BuilderNode[],
  nodeId: string,
  portIndex: number,
  patch: Partial<BuilderPortConfig>,
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) {
      return node
    }

    const portConfigs = reconcilePortConfigs(node.data.portConfigs, node.data.portCount)
    const existing = portConfigs[portIndex] ?? createDefaultPortConfig()
    const nextPortConfigs = portConfigs.map((portConfig, index) =>
      index === portIndex ? { ...existing, ...patch } : portConfig,
    )

    return {
      ...node,
      data: {
        ...node.data,
        portConfigs: nextPortConfigs,
      },
    }
  })
}

export function updateEdgeData(
  edges: BuilderEdge[],
  edgeId: string,
  patch: Partial<BuilderEdgeData>,
): BuilderEdge[] {
  return edges.map((edge) =>
    edge.id === edgeId
      ? {
          ...edge,
          label: normalizeCableLabel(patch.label ?? edge.data?.label, edge.id),
          data: {
            label: normalizeCableLabel(patch.label ?? edge.data?.label, edge.id),
            sourcePortIndex: normalizePortIndex(
              patch.sourcePortIndex ?? edge.data?.sourcePortIndex,
            ),
            targetPortIndex: normalizePortIndex(
              patch.targetPortIndex ?? edge.data?.targetPortIndex,
            ),
            routeOffset: normalizeRouteOffset(
              patch.routeOffset ?? edge.data?.routeOffset,
            ),
          },
        }
      : edge,
  )
}

export function getPortName(node: BuilderNode, portIndex: number): string {
  const prefix = sanitizePortPrefix(node.data.portPrefix)
  return `${prefix}${normalizePortIndex(portIndex)}`
}

export function getUsedPortIndexes(
  edges: BuilderEdge[],
  nodeId: string,
  excludedEdgeId?: string,
): number[] {
  const used = new Set<number>()

  for (const edge of edges) {
    if (edge.id === excludedEdgeId) {
      continue
    }
    if (edge.source === nodeId) {
      used.add(normalizePortIndex(edge.data?.sourcePortIndex))
    }
    if (edge.target === nodeId) {
      used.add(normalizePortIndex(edge.data?.targetPortIndex))
    }
  }

  return Array.from(used).sort((first, second) => first - second)
}

export function getSuggestedPortIndex(
  node: BuilderNode,
  edges: BuilderEdge[],
  excludedEdgeId?: string,
): number {
  const used = new Set(getUsedPortIndexes(edges, node.id, excludedEdgeId))
  const configuredCount = clampPortCount(node.data.portCount)

  for (let index = 0; index < configuredCount; index += 1) {
    if (!used.has(index)) {
      return index
    }
  }

  return configuredCount
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

function sanitizePortPrefix(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .slice(0, 16)
  return normalized || 'eth'
}

function createUniqueCableId(
  taken: Set<string>,
  label: string,
  index: number,
): string {
  const baseId = slugify(label || `cable-${index + 1}`)
  let candidate = baseId
  let suffix = 2
  while (taken.has(candidate)) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }
  taken.add(candidate)
  return candidate
}

function normalizeCableLabel(value: string | undefined, fallback: string): string {
  return sanitizeLabel(value ?? '') || sanitizeLabel(fallback) || 'cable'
}

function normalizePortIndex(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.trunc(value))
}

function normalizeRouteOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(-180, Math.min(180, Math.round(value)))
}

function sanitizeProtocol(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9/_. -]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 48)
}

function clampPortCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(Math.max(Math.trunc(value), 1), 96)
}

function createDefaultPortConfig(): BuilderPortConfig {
  return {
    enabled: true,
    mgmtOnly: false,
  }
}

function createDefaultPortConfigs(portCount: number): BuilderPortConfig[] {
  return Array.from({ length: clampPortCount(portCount) }, () => createDefaultPortConfig())
}

function reconcilePortConfigs(
  portConfigs: BuilderPortConfig[] | undefined,
  portCount: number,
): BuilderPortConfig[] {
  const normalizedPortCount = clampPortCount(portCount)
  const source = portConfigs ?? []
  return Array.from({ length: normalizedPortCount }, (_, index) => ({
    ...createDefaultPortConfig(),
    ...source[index],
  }))
}

function buildNormalizedNodeData(data: BuilderNodeData): BuilderNodeData {
  const portCount = clampPortCount(data.portCount)
  return {
    ...data,
    portCount,
    portConfigs: reconcilePortConfigs(data.portConfigs, portCount),
  }
}

function normalizeVlanId(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(Math.max(Math.trunc(value), 1), 4094)
}

function normalizeRackPosition(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined
  }
  return Math.min(Math.max(Math.trunc(value), 1), 60)
}

function normalizeLabel(value: string, fallback: string): string {
  return sanitizeLabel(value) || sanitizeLabel(fallback) || 'item'
}

function normalizeOptionalText(value: string): string | undefined {
  const normalized = sanitizeLabel(value)
  return normalized || undefined
}
