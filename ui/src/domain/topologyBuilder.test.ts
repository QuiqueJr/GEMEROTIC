import { describe, expect, it } from 'vitest'

import {
  buildTopologyPayload,
  createInitialBuilderState,
  getNextAssetIndex,
  slugify,
} from './topologyBuilder'

describe('topologyBuilder', () => {
  it('convierte el estado visual inicial a TopologyCreate', () => {
    const payload = buildTopologyPayload(createInitialBuilderState())

    expect(payload.name).toBe('mvp-lab-01')
    expect(payload.sites).toHaveLength(1)
    expect(payload.rooms[0].site_id).toBe('site-main')
    expect(payload.racks[0].room_id).toBe('room-main')
    expect(payload.devices).toHaveLength(4)
    expect(payload.devices[0].ports[0].id).toBe('router-01:eth0')
    expect(payload.devices[0].ports).toHaveLength(4)
    expect(payload.interfaces[0].mgmt_only).toBe(false)
    expect(payload.vlans[0].vlan_id).toBeGreaterThan(0)
    expect(payload.cables).toHaveLength(3)
    expect(payload.security_zones.length).toBeGreaterThan(1)
    expect(payload.conduits.length).toBeGreaterThan(0)
    expect(payload.conduits[0].allowed_protocols.length).toBeGreaterThan(0)
  })

  it('normaliza identificadores compatibles con el backend', () => {
    expect(slugify('PLC Linea A / Celda 01')).toBe('plc-linea-a-celda-01')
  })

  it('calcula el siguiente indice disponible por tipo de activo', () => {
    const state = createInitialBuilderState()

    expect(getNextAssetIndex(state.nodes, 'router')).toBe(1)
    expect(getNextAssetIndex(state.nodes, 'plc')).toBe(1)
    expect(getNextAssetIndex(state.nodes, 'firewall')).toBe(0)
  })

  it('incluye configuracion fisica y logica editable en el payload', () => {
    const state = createInitialBuilderState()
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
      },
    }

    const payload = buildTopologyPayload(state)

    expect(payload.devices[0].manufacturer).toBe('Cisco')
    expect(payload.devices[0].firmware_version).toBe('17.12')
    expect(payload.devices[0].serial_number).toBe('SN-001')
    expect(payload.devices[0].rack_position).toBe(12)
    expect(payload.interfaces[0].ipv4_address).toBe('10.22.0.1/24')
    expect(payload.interfaces[0].mac_address).toBe('00:1A:2B:3C:4D:5E')
    expect(payload.interfaces[0].mgmt_only).toBe(true)
    expect(payload.vlans.some((vlan) => vlan.vlan_id === 220)).toBe(true)
  })

  it('normaliza rangos numericos antes de enviar al backend', () => {
    const state = createInitialBuilderState()
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
})
