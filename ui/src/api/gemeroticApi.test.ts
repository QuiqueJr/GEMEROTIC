import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  bootstrapNetBox,
  chatWithComplianceAssistant,
  createTopology,
  deployPipeline,
  deploySavedPipeline,
  generateComplianceReport,
  generatePipelineArtifacts,
  generateSavedPipelineArtifacts,
  getHealth,
  getPipelineLabStatus,
  getPipelineTools,
  getTopologyState,
  runPipelineConsoleCommand,
  saveTopologyState,
} from './gemeroticApi'

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

  it('omite API key en endpoints mutantes cuando no esta configurada', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', message: 'OK' })),
    )

    await bootstrapNetBox({ baseUrl: 'http://localhost:8000' })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/netbox/bootstrap',
    )
    expect(headers.has('X-API-Key')).toBe(false)
  })

  it('envia API key en endpoints mutantes cuando existe', async () => {
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

  it('guarda estado visual del builder con PUT', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Topology state saved successfully',
          data: {
            project_name: 'mvp-lab-01',
            topology_validation: { status: 'valid', detail: null },
            netbox_sync: { status: 'skipped', detail: null },
          },
        }),
      ),
    )

    await saveTopologyState(config, 'mvp-lab-01', {
      project_name: 'mvp-lab-01',
      version: 1,
      settings: { name: 'MVP Lab 01' },
      nodes: [],
      edges: [],
      drawings: [],
      active_view: 'physical',
      topology: { name: 'mvp-lab-01' },
    })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/topology/state/mvp-lab-01',
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect(headers.get('X-API-Key')).toBe('test-key')
    expect(fetchMock.mock.calls[0][1]?.body).toContain('"project_name":"mvp-lab-01"')
  })

  it('carga estado visual del builder', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Topology state loaded successfully',
          data: {
            project_name: 'mvp-lab-01',
            version: 1,
            settings: { name: 'MVP Lab 01' },
            nodes: [],
            edges: [],
            drawings: [],
            active_view: 'logical',
          },
        }),
      ),
    )

    await getTopologyState(config, 'mvp-lab-01')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/topology/state/mvp-lab-01',
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('genera artefactos del pipeline con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline artifacts generated successfully',
          data: { topology_name: 'mvp-lab-01', artifacts: [] },
        }),
      ),
    )

    await generatePipelineArtifacts(config, { name: 'mvp-lab-01' })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/artifacts',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('genera artefactos desde topologia guardada con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline artifacts generated from saved topology',
          data: { topology_name: 'mvp-lab-01', artifacts: [] },
        }),
      ),
    )

    await generateSavedPipelineArtifacts(config, 'mvp-lab-01')
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/artifacts/mvp-lab-01',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('despliega pipeline con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline deployed successfully',
          data: { topology_name: 'mvp-lab-01', artifacts: [], commands: [] },
        }),
      ),
    )

    await deployPipeline(config, { name: 'mvp-lab-01' })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/deploy',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('despliega la topologia guardada con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline deployed from saved topology',
          data: { topology_name: 'mvp-lab-01', artifacts: [], commands: [] },
        }),
      ),
    )

    await deploySavedPipeline(config, 'mvp-lab-01')
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/deploy/mvp-lab-01',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('consulta herramientas del pipeline con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline tool status collected',
          data: { tools: [] },
        }),
      ),
    )

    await getPipelineTools(config)
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/tools',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('consulta el estado del lab con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline lab status collected',
          data: { topology_name: 'mvp-lab-01', nodes: [] },
        }),
      ),
    )

    await getPipelineLabStatus(config, 'mvp-lab-01')
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/labs/mvp-lab-01',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('ejecuta comandos de consola del runtime con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Pipeline console command executed',
          data: {
            topology_name: 'mvp-lab-01',
            node_id: 'router-01',
            container_name: 'clab-mvp-lab-01-router-01',
            command: ['ip', 'link', 'show'],
            exit_code: 0,
            stdout_tail: '',
            stderr_tail: '',
          },
        }),
      ),
    )

    await runPipelineConsoleCommand(config, 'mvp-lab-01', 'router-01', 'ip link show')
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/pipeline/labs/mvp-lab-01/nodes/router-01/console',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('genera informe de compliance con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Compliance report generated successfully',
          data: {
            topology_name: 'mvp-lab-01',
            summary: { overall_posture: 'partial' },
            findings: [],
          },
        }),
      ),
    )

    await generateComplianceReport(config, { name: 'mvp-lab-01' })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/compliance/report',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })

  it('consulta al asistente de compliance con API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          message: 'Compliance assistant response generated successfully',
          data: {
            mode: 'local_advisor',
            scope_allowed: true,
            answer: 'ok',
            cited_controls: [],
            suggested_actions: [],
            limitations: [],
            report: {
              topology_name: 'mvp-lab-01',
              summary: { overall_posture: 'partial' },
              findings: [],
            },
          },
        }),
      ),
    )

    await chatWithComplianceAssistant(config, {
      topology: { name: 'mvp-lab-01' },
      messages: [{ role: 'user', content: 'cumple?' }],
    })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8000/api/v1/compliance/chat',
    )
    expect(headers.get('X-API-Key')).toBe('test-key')
  })
})
