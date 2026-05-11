import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  })
})

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
    expect(screen.getAllByRole('button', { name: 'Añadir enlace' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Física' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lógica' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Seguridad' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Resumen de topología')).toBeInTheDocument()
    expect(screen.getByText('Resumen de servicios')).toBeInTheDocument()
    expect(screen.getByText('Router Core')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir zona' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir rectangulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir circulo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir texto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument()
  })

  it('modela localizaciones jerarquicas en la vista fisica', () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Nueva ciudad' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Física' }))

    expect(screen.getByRole('button', { name: 'Nueva ciudad' })).toBeInTheDocument()
    expect(screen.getByText('Localizaciones físicas')).toBeInTheDocument()
    const albaceteMarker = screen.getAllByRole('button', {
      name: 'Abrir localización Planta Principal',
    })[0]
    fireEvent.pointerDown(albaceteMarker, {
      button: 0,
      clientX: 360,
      clientY: 580,
      pointerId: 1,
    })
    fireEvent.pointerUp(albaceteMarker, {
      clientX: 360,
      clientY: 580,
      pointerId: 1,
    })

    const addBuildingButton = screen.getByRole('button', { name: 'Nuevo edificio' })
    expect(addBuildingButton).not.toBeDisabled()
    fireEvent.click(addBuildingButton)

    expect(screen.getAllByText('Edificio 4').length).toBeGreaterThan(0)
    const addClosetButton = screen.getByRole('button', { name: 'Nuevo cuarto de cableado' })
    expect(addClosetButton).not.toBeDisabled()
    fireEvent.click(addClosetButton)

    expect(screen.getAllByText('Cuarto de cableado 1').length).toBeGreaterThan(0)
    const rackButton = screen.getByRole('button', { name: 'Rack' })
    expect(rackButton).not.toBeDisabled()
    fireEvent.click(rackButton)

    expect(screen.getAllByText('Rack 1').length).toBeGreaterThan(0)
  })

  it('permite mover localizaciones y elementos físicos colocados', () => {
    const captureMock = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: captureMock,
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 1000,
      height: 1000,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Física' }))
    const albaceteMarker = screen.getAllByRole('button', {
      name: 'Abrir localización Planta Principal',
    })[0]

    fireEvent.pointerDown(albaceteMarker, {
      button: 0,
      clientX: 360,
      clientY: 580,
      pointerId: 1,
    })
    fireEvent.pointerMove(albaceteMarker, {
      clientX: 800,
      clientY: 220,
      pointerId: 1,
    })
    fireEvent.pointerUp(albaceteMarker, {
      clientX: 800,
      clientY: 220,
      pointerId: 1,
    })

    expect(captureMock).toHaveBeenCalledWith(1)
    expect(albaceteMarker).toHaveStyle({ left: '80%', top: '22%' })
  })

  it('crea un cable nuevo mediante el flujo por puertos tipo gns3', () => {
    render(<App />)
    const workspace = screen.getAllByRole('application')[0]

    fireEvent.click(screen.getByRole('button', { name: /Router Core/i }))
    fireEvent.click(screen.getByRole('button', { name: /Switch Acceso/i }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Añadir enlace' })[0])
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

  it('permite añadir un mapa de imagen a la localización seleccionada', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Física' }))
    const file = new File(['mapa demo'], 'planta.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Archivo de mapa físico'), {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByText('planta.png')).toBeInTheDocument()
    })
    expect(screen.getByAltText('Mapa físico de Mapa interurbano')).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png;base64,/),
    )
    expect(screen.queryByLabelText('Consola estilo GNS3')).not.toBeInTheDocument()
  })

  it('muestra lab pendiente sin error HTTP cuando aun no esta desplegado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Pipeline lab is not deployed',
        data: {
          topology_name: 'nuevo-proyecto-ot',
          lab_path: '',
          abs_lab_path: '',
          deployed: false,
          detail: 'Pipeline lab is unavailable: nuevo-proyecto-ot',
          nodes: [],
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Inspeccionar lab' })[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/pipeline/labs/nuevo-proyecto-ot',
        expect.objectContaining({ method: 'GET' }),
      )
    })
    expect(
      screen.getAllByText(/Lab no desplegado para nuevo-proyecto-ot/i).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('ERROR')).not.toBeInTheDocument()
  })

  it('permite crear y editar dibujos fisicos tipo gns3', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Añadir rectangulo' }))

    const editor = screen.getByRole('dialog', { name: 'Editor de dibujo' })
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

    fireEvent.click(screen.getByRole('button', { name: /Router Core/i }))
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
      screen.queryByRole('dialog', { name: 'Configuración del proyecto' }),
    ).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/netbox/bootstrap',
      expect.objectContaining({ method: 'POST' }),
    )
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers
    expect(headers.has('X-API-Key')).toBe(false)
  })

  it('guarda el estado actual del canvas desde el boton de persistir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Topology state saved successfully',
          data: {
            project_name: 'nuevo-proyecto-ot',
            topology_name: 'nuevo-proyecto-ot',
            saved_at: '2026-05-07T00:00:00+00:00',
            store_dir: '/tmp/gemerotic-test',
            topology_save: null,
            topology_validation: { status: 'valid', detail: null },
            netbox_sync: { status: 'synchronized', detail: null },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          app_name: 'GEMEROTIC',
          version: '0.1.0',
          checks: {
            netbox_connected: true,
            rate_limit_backend_connected: true,
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
          message: 'Pipeline artifacts generated from saved topology',
          data: {
            topology_name: 'nuevo-proyecto-ot',
            artifacts: [
              {
                path: 'containerlab/topology.clab.yml',
                stage: 'containerlab',
                content_type: 'text/yaml',
                content: 'name: nuevo-proyecto-ot',
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
          message: 'Compliance report generated successfully',
          data: {
            topology_name: 'nuevo-proyecto-ot',
            baseline: ['IEC 62443', 'NIS2', 'ISO/IEC 27001'],
            generated_at: '2026-05-07T00:00:00+00:00',
            summary: {
              overall_posture: 'strong',
              assessed_controls: 4,
              not_assessed_controls: 0,
              passed_controls: 4,
              warned_controls: 0,
              failed_controls: 0,
              coverage_percent: 100,
            },
            findings: [],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Router Core/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Persistir topologia' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/topology/state/nuevo-proyecto-ot',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.nodes).toHaveLength(1)
    expect(body.nodes[0].id).toBe('router-01')
    expect(body.topology.devices).toHaveLength(1)
    expect(window.localStorage.getItem('gemerotic-current-project-v2')).toBe(
      'nuevo-proyecto-ot',
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/compliance/report',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/pipeline/artifacts/nuevo-proyecto-ot',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(screen.getAllByText(/Pipeline 3\/4/i).length).toBeGreaterThan(0)
  })

  it('rehidrata el canvas guardado al recargar la interfaz', async () => {
    window.localStorage.setItem('gemerotic-current-project-v2', 'demo-planta')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Topology state loaded successfully',
        data: {
          project_name: 'demo-planta',
          version: 1,
          settings: {
            name: 'demo-planta',
            description: 'Topologia demo',
            siteName: 'Planta Principal',
            roomName: 'Cuarto Servidores',
            rackName: 'Rack Red 01',
          },
          nodes: [
            {
              id: 'router-01',
              type: 'asset',
              position: { x: 120, y: 150 },
              data: {
                label: 'Router Core',
                assetType: 'router',
                criticality: 'high',
                portCount: 4,
                portPrefix: 'eth',
                zoneId: 'zone-it',
                zoneName: 'Zona IT',
                purdueLevel: 4,
                securityLevel: 'SL-2',
                vlanId: 140,
                vlanName: 'IT Planta',
                mgmtOnly: false,
                enabled: true,
                portConfigs: [
                  { enabled: true, mgmtOnly: false },
                  { enabled: true, mgmtOnly: false },
                  { enabled: true, mgmtOnly: false },
                  { enabled: true, mgmtOnly: false },
                ],
                allowedProtocols: ['HTTPS', 'SSH', 'SNMP'],
              },
            },
          ],
          edges: [],
          drawings: [],
          active_view: 'logical',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/topology/state/demo-planta',
        expect.objectContaining({ method: 'GET' }),
      )
    })
    expect((await screen.findAllByText('demo-planta')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Router Core').length).toBeGreaterThan(1)
  })

  it('ignora estado remoto inexistente sin mostrar error de carga', async () => {
    window.localStorage.setItem('gemerotic-current-project-v2', 'demo-planta')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Topology state not found',
        data: null,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/v1/topology/state/demo-planta',
        expect.objectContaining({ method: 'GET' }),
      )
    })
    expect(screen.queryByText('ERROR')).not.toBeInTheDocument()
    expect(screen.getAllByText('Router Core').length).toBeGreaterThan(0)
  })

  it('conserva el draft local si el servidor devuelve un estado mas antiguo', async () => {
    window.localStorage.setItem('gemerotic-current-project-v2', 'local-planta')
    window.localStorage.setItem(
      'gemerotic-project-draft-v2:local-planta',
      JSON.stringify({
        project_name: 'local-planta',
        version: 1,
        client_saved_at: '2026-05-07T12:00:00.000Z',
        settings: {
          name: 'local-planta',
          description: 'Draft local',
          siteName: 'Planta Principal',
          roomName: 'Cuarto Servidores',
          rackName: 'Rack Red 01',
        },
        nodes: [
          {
            id: 'router-01',
            type: 'asset',
            position: { x: 120, y: 150 },
            data: {
              label: 'Router Core',
              assetType: 'router',
              criticality: 'high',
              portCount: 4,
              portPrefix: 'eth',
              zoneId: 'zone-it',
              zoneName: 'Zona IT',
              purdueLevel: 4,
              securityLevel: 'SL-2',
              vlanId: 140,
              vlanName: 'IT Planta',
              mgmtOnly: false,
              enabled: true,
              portConfigs: [
                { enabled: true, mgmtOnly: false },
                { enabled: true, mgmtOnly: false },
                { enabled: true, mgmtOnly: false },
                { enabled: true, mgmtOnly: false },
              ],
              allowedProtocols: ['HTTPS', 'SSH', 'SNMP'],
            },
          },
        ],
        edges: [],
        drawings: [],
        active_view: 'logical',
      }),
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Topology state loaded successfully',
        data: {
          project_name: 'local-planta',
          version: 1,
          client_saved_at: '2026-05-07T11:00:00.000Z',
          settings: {
            name: 'local-planta',
            description: 'Estado antiguo',
            siteName: 'Planta Principal',
            roomName: 'Cuarto Servidores',
            rackName: 'Rack Red 01',
          },
          nodes: [],
          edges: [],
          drawings: [],
          active_view: 'logical',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    expect(screen.getAllByText('Router Core').length).toBeGreaterThan(1)
  })

  it('genera artefactos desde la toolbar cuando la conectividad esta configurada', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Topology state saved successfully',
          data: {
            project_name: 'mvp-lab-01',
            topology_name: 'mvp-lab-01',
            saved_at: '2026-05-07T00:00:00+00:00',
            store_dir: '/tmp/gemerotic-test',
            topology_save: {
              topology_name: 'mvp-lab-01',
              saved_at: '2026-05-07T00:00:00+00:00',
              store_dir: '/tmp/gemerotic-test',
              artifact_count: 13,
              netbox_sync: { status: 'synchronized', detail: null },
            },
            topology_validation: { status: 'valid', detail: null },
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

    fireEvent.click(screen.getByRole('button', { name: /Router Core/i }))
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
      await screen.findByRole('dialog', { name: 'Navegador de datos' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Artefactos').length).toBeGreaterThan(0)
  })

  it('despliega el pipeline aunque OPA este ausente', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'success',
          message: 'Topology state saved successfully',
          data: {
            project_name: 'mvp-lab-01',
            topology_name: 'mvp-lab-01',
            saved_at: '2026-05-07T00:00:00+00:00',
            store_dir: '/tmp/gemerotic-test',
            topology_save: {
              topology_name: 'mvp-lab-01',
              saved_at: '2026-05-07T00:00:00+00:00',
              store_dir: '/tmp/gemerotic-test',
              artifact_count: 13,
              netbox_sync: { status: 'synchronized', detail: null },
            },
            topology_validation: { status: 'valid', detail: null },
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

    fireEvent.click(screen.getByRole('button', { name: /Router Core/i }))
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
