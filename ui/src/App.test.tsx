import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renderiza la base del constructor visual', () => {
    render(<App />)

    expect(screen.getByText('GEMEROTIC')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Digital Twin OT/IT' }))
      .toBeInTheDocument()
    const viewNav = screen.getByRole('navigation', { name: 'Vista de topologia' })
    expect(within(viewNav).getByRole('button', { name: /Fisica/ }))
      .toBeInTheDocument()
    expect(within(viewNav).getByRole('button', { name: /Logica/ }))
      .toBeInTheDocument()
    expect(within(viewNav).getByRole('button', { name: /Seguridad/ }))
      .toBeInTheDocument()
  })
})
