import { describe, expect, it } from 'vitest'

import { assetCatalog } from './assetCatalog'
import {
  buildTopologyPayload,
  createBuilderEdge,
  createInitialBuilderState,
  createNodeFromAsset,
  getNextAssetIndex,
  getPortName,
  getSuggestedPortIndex,
  slugify,
  updateEdgeData,
  updatePortConfig,
} from './topologyBuilder'
import type { BuilderState } from './topologyTypes'

function createDemoBuilderState(): BuilderState {
  const state = createInitialBuilderState()
  state.nodes = [
    createNodeFromAsset(assetCatalog[0], 0, { x: 120, y: 150 }),
    createNodeFromAsset(assetCatalog[1], 0, { x: 400, y: 150 }),
    createNodeFromAsset(assetCatalog[6], 0, { x: 680, y: 80 }),
    createNodeFromAsset(assetCatalog[7], 0, { x: 680, y: 230 }),
  ]
  state.edges = [
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
  return state
}

describe('topologyBuilder', () => {
  it('crea un estado inicial vacio para no imponer una topologia demo', () => {
    const payload = buildTopologyPayload(createInitialBuilderState())

    expect(payload.name).toBe('nuevo-proyecto-ot')
    expect(payload.sites).toHaveLength(1)
    expect(payload.rooms[0].site_id).toBe('site-main')
    expect(payload.racks[0].room_id).toBe('room-main')
    expect(payload.devices).toHaveLength(0)
    expect(payload.interfaces).toHaveLength(0)
    expect(payload.vlans).toHaveLength(0)
    expect(payload.cables).toHaveLength(0)
    expect(payload.security_zones).toHaveLength(0)
    expect(payload.conduits).toHaveLength(0)
    expect(payload.canvas.assets).toHaveLength(0)
    expect(payload.canvas.cables).toHaveLength(0)
  })

  it('convierte un estado visual con equipos a TopologyCreate', () => {
    const payload = buildTopologyPayload(createDemoBuilderState())

    expect(payload.name).toBe('nuevo-proyecto-ot')
    expect(payload.devices).toHaveLength(4)
    expect(payload.devices[0].ports[0].id).toBe('router-01:eth0')
    expect(payload.devices[0].ports).toHaveLength(4)
    expect(payload.interfaces[0].mgmt_only).toBe(false)
    expect(payload.vlans[0].vlan_id).toBeGreaterThan(0)
    expect(payload.cables).toHaveLength(3)
    expect(payload.cables[0].id).toBe('uplink-core')
    expect(payload.security_zones.length).toBeGreaterThan(1)
    expect(payload.conduits.length).toBeGreaterThan(0)
    expect(payload.conduits[0].allowed_protocols.length).toBeGreaterThan(0)
    expect(payload.canvas.assets[0]).toMatchObject({
      id: 'router-01',
      asset_type: 'router',
      position: { x: 120, y: 150 },
    })
    expect(payload.canvas.cables[0]).toMatchObject({
      id: 'uplink-core',
      source_device_id: 'router-01',
      target_device_id: 'switch-01',
    })
  })

  it('normaliza identificadores compatibles con el backend', () => {
    expect(slugify('PLC Linea A / Celda 01')).toBe('plc-linea-a-celda-01')
  })

  it('calcula el siguiente indice disponible por tipo de activo', () => {
    const state = createDemoBuilderState()

    expect(getNextAssetIndex(state.nodes, 'router')).toBe(1)
    expect(getNextAssetIndex(state.nodes, 'plc')).toBe(1)
    expect(getNextAssetIndex(state.nodes, 'firewall')).toBe(0)
  })

  it('incluye configuracion fisica y logica editable en el payload', () => {
    const state = createDemoBuilderState()
    state.nodes[0] = {
      ...state.nodes[0],
      data: {
        ...state.nodes[0].data,
        manufacturer: 'Cisco',
        model: 'IE-3400',
        firmwareVersion: '17.12',
        serialNumber: 'SN-001',
        rackPosition: 12,
        vlanId: 220,
        vlanName: 'OT Backbone',
        ipv4Address: '10.22.0.1/24',
        macAddress: '00:1A:2B:3C:4D:5E',
        mgmtOnly: true,
        runningConfig: 'hostname router-01\n!',
      },
    }

    const payload = buildTopologyPayload(state)

    expect(payload.devices[0].manufacturer).toBe('Cisco')
    expect(payload.devices[0].firmware_version).toBe('17.12')
    expect(payload.devices[0].serial_number).toBe('SN-001')
    expect(payload.devices[0].rack_position).toBe(12)
    expect(payload.devices[0].config?.runningConfig).toBe('hostname router-01\n!')
    expect(payload.interfaces[0].ipv4_address).toBe('10.22.0.1/24')
    expect(payload.interfaces[0].mac_address).toBe('00:1A:2B:3C:4D:5E')
    expect(payload.interfaces[0].mgmt_only).toBe(true)
    expect(payload.vlans.some((vlan) => vlan.vlan_id === 220)).toBe(true)
  })

  it('normaliza rangos numericos antes de enviar al backend', () => {
    const state = createDemoBuilderState()
    state.nodes[0] = {
      ...state.nodes[0],
      data: {
        ...state.nodes[0].data,
        label: '',
        rackPosition: 99,
        portCount: 0,
        vlanId: 5000,
        vlanName: '',
      },
    }

    const payload = buildTopologyPayload(state)

    expect(payload.devices[0].name).toBe('router-01')
    expect(payload.devices[0].rack_position).toBe(60)
    expect(payload.devices[0].ports).toHaveLength(1)
    expect(payload.vlans.some((vlan) => vlan.vlan_id === 4094)).toBe(true)
    expect(payload.vlans.find((vlan) => vlan.vlan_id === 4094)?.name).toBe(
      'VLAN 4094',
    )
  })

  it('usa puertos explicitos del cable y expande puertos si hace falta', () => {
    const state = createDemoBuilderState()
    state.edges[0] = updateEdgeData(state.edges, 'edge-router-switch', {
      sourcePortIndex: 3,
      targetPortIndex: 5,
      label: 'uplink-core-b',
    })[0]

    const payload = buildTopologyPayload(state)

    expect(payload.cables[0].id).toBe('uplink-core-b')
    expect(payload.cables[0].terminations[0].port_id).toBe('router-01:eth3')
    expect(payload.cables[0].terminations[1].port_id).toBe('switch-01:eth5')
    expect(payload.devices.find((device) => device.id === 'switch-01')?.ports).toHaveLength(8)
  })

  it('reasigna puertos repetidos antes de persistir cables nuevos', () => {
    const state = createDemoBuilderState()
    const extraNodes = [
      createNodeFromAsset(assetCatalog[2], 0, { x: 120, y: 380 }),
      createNodeFromAsset(assetCatalog[3], 0, { x: 300, y: 380 }),
      createNodeFromAsset(assetCatalog[4], 0, { x: 480, y: 380 }),
      createNodeFromAsset(assetCatalog[5], 0, { x: 660, y: 380 }),
      createNodeFromAsset(assetCatalog[8], 0, { x: 840, y: 380 }),
      createNodeFromAsset(assetCatalog[9], 0, { x: 1020, y: 380 }),
    ]
    state.nodes = [...state.nodes, ...extraNodes]
    state.edges = [
      ...state.edges,
      ...extraNodes.map((node) =>
        createBuilderEdge({
          id: `edge-switch-${node.id}`,
          source: 'switch-01',
          target: node.id,
        }),
      ),
    ]

    const payload = buildTopologyPayload(state)
    const portIds = payload.cables.flatMap((cable) =>
      cable.terminations.map((termination) => termination.port_id),
    )
    const switchPorts = payload.cables
      .flatMap((cable) => cable.terminations)
      .map((termination) => termination.port_id)
      .filter((portId) => portId.startsWith('switch-01:'))

    expect(new Set(portIds).size).toBe(portIds.length)
    expect(switchPorts).toEqual([
      'switch-01:eth0',
      'switch-01:eth1',
      'switch-01:eth2',
      'switch-01:eth3',
      'switch-01:eth4',
      'switch-01:eth5',
      'switch-01:eth6',
      'switch-01:eth7',
      'switch-01:eth8',
    ])
    expect(payload.devices.find((device) => device.id === 'switch-01')?.ports).toHaveLength(9)
  })

  it('sugiere el siguiente puerto libre por nodo', () => {
    const state = createDemoBuilderState()

    expect(getSuggestedPortIndex(state.nodes[0], state.edges)).toBe(1)
    expect(getPortName(state.nodes[0], 0)).toBe('eth0')
  })

  it('crea cables con etiquetas y puertos iniciales', () => {
    const edge = createBuilderEdge({
      id: 'edge-a',
      source: 'router-01',
      target: 'switch-01',
      label: 'backbone-a',
      sourcePortIndex: 2,
      targetPortIndex: 4,
    })

    expect(edge.label).toBe('backbone-a')
    expect(edge.data?.sourcePortIndex).toBe(2)
    expect(edge.data?.targetPortIndex).toBe(4)
  })

  it('descarta enlaces huerfanos antes de enviar al backend', () => {
    const state = createDemoBuilderState()
    state.edges = [
      ...state.edges,
      createBuilderEdge({
        id: 'edge-orphan',
        source: 'router-01',
        target: 'missing-node',
        label: 'orphan',
      }),
    ]

    const payload = buildTopologyPayload(state)

    expect(payload.cables.some((cable) => cable.id === 'orphan')).toBe(false)
    expect(payload.canvas.cables.some((cable) => cable.id === 'orphan')).toBe(false)
  })

  it('permite configurar puertos individualmente antes de generar el payload', () => {
    const state = createDemoBuilderState()
    state.nodes = updatePortConfig(state.nodes, 'router-01', 1, {
      enabled: false,
      mgmtOnly: true,
      ipv4Address: '172.16.1.1/24',
    })

    const payload = buildTopologyPayload(state)
    const portInterface = payload.interfaces.find(
      (item) => item.port_id === 'router-01:eth1',
    )

    expect(portInterface?.enabled).toBe(false)
    expect(portInterface?.mgmt_only).toBe(true)
    expect(portInterface?.ipv4_address).toBe('172.16.1.1/24')
  })
})
