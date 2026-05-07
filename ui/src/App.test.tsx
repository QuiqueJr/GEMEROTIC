import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renderiza el workspace tipo GNS3 del builder OT', () => {
    render(<App />)

    expect(screen.getByText('GEMEROTIC')).toBeInTheDocument()
    const menuBar = screen.getByRole('menubar', { name: 'Barra de proyecto' })
    expect(within(menuBar).getByRole('button', { name: 'Proyecto' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add Link' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Fisica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seguridad' })).toBeInTheDocument()
    expect(screen.getByText('Topology Summary')).toBeInTheDocument()
    expect(screen.getByText('Servers Summary')).toBeInTheDocument()
    expect(screen.getByText(/Celda OT/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir zona' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir rectangulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir circulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir texto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
  })

  it('crea un cable nuevo mediante el flujo por puertos tipo gns3', () => {
    render(<App />)
    const workspace = screen.getAllByRole('application')[0]

    fireEvent.click(screen.getAllByRole('button', { name: 'Add Link' })[0])
    fireEvent.click(within(workspace).getAllByText('Router Core')[0])

    const sourcePicker = screen.getByRole('dialog', {
      name: 'Seleccion de puerto de origen',
    })
    fireEvent.click(within(sourcePicker).getByRole('button', { name: /eth1/i }))

    fireEvent.click(within(workspace).getAllByText('Switch Acceso')[0])

    const targetPicker = screen.getByRole('dialog', {
      name: 'Seleccion de puerto de destino',
    })
    fireEvent.click(within(targetPicker).getByRole('button', { name: /eth3/i }))

    expect(
      screen.getAllByText(/Cable creado: Router Core eth1 -> Switch Acceso eth3/i).length,
    ).toBeGreaterThan(0)
  })

  it('abre una consola dedicada por nodo seleccionado', () => {
    render(<App />)

    const openConsoleButton = screen
      .getAllByRole('button', { name: 'Abrir consola del nodo' })
      .find((button) => !button.hasAttribute('disabled'))
    expect(openConsoleButton).toBeDefined()
    fireEvent.click(openConsoleButton!)

    expect(screen.getByRole('tab', { name: /router core/i })).toBeInTheDocument()
    expect(
      screen.getByText(/Consola del runtime Linux del lab/i),
    ).toBeInTheDocument()
  })

  it('permite crear y editar dibujos fisicos tipo gns3', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir rectangulo' }))

    const editor = screen.getByRole('dialog', { name: 'Drawing editor' })
    expect(editor).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Sala MCC principal' },
    })
    fireEvent.change(screen.getByLabelText('Tipo'), {
      target: { value: 'ellipse' },
    })
    fireEvent.change(screen.getByLabelText('Ancho'), {
      target: { value: '240' },
    })
    fireEvent.change(screen.getByLabelText('Alto'), {
      target: { value: '160' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar editor de dibujo' }))

    expect(screen.getByText('Sala MCC principal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar seleccion' }))

    expect(screen.getByText('Sala MCC principal copia')).toBeInTheDocument()
  })

  it('muestra una pestaña de puertos en el editor del dispositivo', () => {
    render(<App />)

    fireEvent.doubleClick(screen.getAllByRole('button', { name: /Router Corerouter/i })[0])
    fireEvent.click(screen.getAllByRole('tab', { name: 'Puertos' })[0])

    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('Puerto 1')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Enlace activo').length).toBeGreaterThan(0)
  })

  it('ejecuta acciones protegidas sin X-API-Key en modo MVP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', message: 'OK' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Bootstrap NetBox' })[0])

    expect(
      screen.queryByRole('dialog', { name: 'Project settings' }),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/netbox/bootstrap',
      expect.objectContaining({ method: 'POST' }),
    )
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers
    expect(headers.has('X-API-Key')).toBe(false)
  })

  it('genera artefactos desde la toolbar cuando la conectividad esta configurada', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Topology saved successfully',
          data: {
            topology_name: 'mvp-lab-01',
            saved_at: '2026-05-07T00:00:00+00:00',
            store_dir: '/tmp/gemerotic-test',
            artifact_count: 13,
            netbox_sync: { status: 'synchronized', detail: null },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Pipeline artifacts generated from saved topology',
          data: {
            topology_name: 'mvp-lab-01',
            artifacts: [
              {
                path: 'containerlab/topology.clab.yml',
                stage: 'containerlab',
                content_type: 'text/yaml',
                content: 'name: mvp-lab-01',
              },
            ],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Generar artefactos' })[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/pipeline/artifacts/mvp-lab-01',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers
    expect(headers.has('X-API-Key')).toBe(false)
    expect(
      await screen.findByRole('dialog', { name: 'Data browser' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })

  it('despliega el pipeline aunque OPA este ausente', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Topology saved successfully',
          data: {
            topology_name: 'mvp-lab-01',
            saved_at: '2026-05-07T00:00:00+00:00',
            store_dir: '/tmp/gemerotic-test',
            artifact_count: 13,
            netbox_sync: { status: 'synchronized', detail: null },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Pipeline tool status collected',
          data: {
            tools: [
              { name: 'docker', installed: true, path: '/usr/bin/docker', version: 'ok', error: null },
              {
                name: 'containerlab',
                installed: true,
                path: '/usr/bin/containerlab',
                version: 'ok',
                error: null,
              },
              {
                name: 'ansible-playbook',
                installed: true,
                path: '/usr/bin/ansible-playbook',
                version: 'ok',
                error: null,
              },
              { name: 'opa', installed: false, path: null, version: null, error: null },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Pipeline deployed from saved topology',
          data: {
            topology_name: 'mvp-lab-01',
            bundle_dir: '/app/var/pipeline/mvp-lab-01',
            artifacts: [],
            commands: [
              {
                name: 'containerlab_deploy',
                command: ['containerlab', 'deploy'],
                exit_code: 0,
                stdout_tail: 'deployed',
                stderr_tail: '',
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'success',
          message: 'Pipeline lab status collected',
          data: {
            topology_name: 'mvp-lab-01',
            lab_path: '/tmp/demo.clab.yml',
            abs_lab_path: '/tmp/demo.clab.yml',
            nodes: [],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Desplegar pipeline' })[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/pipeline/deploy/mvp-lab-01',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(screen.queryByText(/Faltan herramientas del pipeline/i)).not.toBeInTheDocument()
  })
})
