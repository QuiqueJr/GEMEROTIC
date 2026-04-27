import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'

afterEach(() => {
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

  it('muestra una pestaña de puertos en el editor del dispositivo', () => {
    render(<App />)

    fireEvent.doubleClick(screen.getAllByRole('button', { name: /Router Corerouter/i })[0])
    fireEvent.click(screen.getAllByRole('tab', { name: 'Puertos' })[0])

    expect(screen.getByText('eth0')).toBeInTheDocument()
    expect(screen.getByText('Puerto 1')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Enlace activo').length).toBeGreaterThan(0)
  })

  it('informa acciones protegidas sin abrir Proyecto automaticamente', () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Bootstrap NetBox' })[0])

    expect(
      screen.queryByRole('dialog', { name: 'Project settings' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByText(/Configura X-API-Key en Proyecto antes de ejecutar: Bootstrap NetBox/i)
        .length,
    ).toBeGreaterThan(0)
  })

  it('genera artefactos desde la toolbar cuando la conectividad esta configurada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        message: 'Pipeline artifacts generated successfully',
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

    const menuBar = screen.getAllByRole('menubar', { name: 'Barra de proyecto' })[0]
    fireEvent.click(within(menuBar).getByRole('button', { name: 'Proyecto' }))
    fireEvent.change(screen.getByLabelText('X-API-Key'), {
      target: { value: 'secret-key' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Generar artefactos' })[0])

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/pipeline/artifacts',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(
      await screen.findByRole('dialog', { name: 'Data browser' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Artifacts')).toBeInTheDocument()
  })
})
