import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

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
      screen.getByText(/Cable creado: Router Core eth1 -> Switch Acceso eth3/i),
    ).toBeInTheDocument()
  })
})
