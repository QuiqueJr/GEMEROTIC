import { afterEach, describe, expect, it, vi } from 'vitest'

import { bootstrapNetBox, createTopology, getHealth } from './gemeroticApi'

const config = {
  baseUrl: 'http://localhost:8000',
  apiKey: 'test-key',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gemeroticApi', () => {
  it('consulta health sin API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'healthy',
          app_name: 'GEMEROTIC',
          version: '0.1.0',
          checks: {
            netbox_connected: true,
            rate_limit_backend_connected: true,
          },
        }),
      ),
    )

    const result = await getHealth(config)
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(result.ok).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/health')
    expect(headers.has('X-API-Key')).toBe(false)
  })

  it('envia API key en endpoints mutantes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', message: 'OK' })),
    )

    await bootstrapNetBox(config)
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/netbox/bootstrap',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('serializa el payload de topologia', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', message: 'Created' })),
    )

    await createTopology(config, { name: 'mvp-lab-01' })

    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"name":"mvp-lab-01"}')
  })
})
