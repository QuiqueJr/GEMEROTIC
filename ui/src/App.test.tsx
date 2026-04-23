import { render, screen, within } from '@testing-library/react'
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
})
