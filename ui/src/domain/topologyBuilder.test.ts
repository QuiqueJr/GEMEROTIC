import { describe, expect, it } from 'vitest'

import {
  buildTopologyPayload,
  createInitialBuilderState,
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
    expect(payload.cables).toHaveLength(3)
    expect(payload.security_zones.length).toBeGreaterThan(1)
    expect(payload.conduits.length).toBeGreaterThan(0)
  })

  it('normaliza identificadores compatibles con el backend', () => {
    expect(slugify('PLC Linea A / Celda 01')).toBe('plc-linea-a-celda-01')
  })
})
