import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renderiza la base del constructor visual', () => {
    render(<App />)

    expect(screen.getByText('GEMEROTIC UI')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Constructor visual OT/IT' }))
      .toBeInTheDocument()
  })
})
