import { describe, expect, it } from 'vitest'

import { createInitialBuilderState } from './topologyBuilder'
import { getEdgeHandleIds, getSiblingOffsets } from './edgeLayout'

describe('edgeLayout', () => {
  it('elige handles laterales cuando los equipos estan alineados horizontalmente', () => {
    const state = createInitialBuilderState()
    const sourceNode = state.nodes[0]
    const targetNode = state.nodes[1]

    expect(getEdgeHandleIds(sourceNode, targetNode)).toEqual({
      sourceHandle: 'right',
      targetHandle: 'left',
    })
  })

  it('elige handles verticales cuando el destino queda por debajo', () => {
    const state = createInitialBuilderState()
    const sourceNode = state.nodes[1]
    const targetNode = {
      ...state.nodes[1],
      position: { x: state.nodes[1].position.x, y: state.nodes[1].position.y + 300 },
    }

    expect(getEdgeHandleIds(sourceNode, targetNode)).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
  })

  it('separa visualmente multiples cables entre el mismo par de nodos', () => {
    const state = createInitialBuilderState()
    const offsets = getSiblingOffsets(state.edges)

    expect(offsets.get('edge-router-switch')).toBe(0)

    const duplicatedPairOffsets = getSiblingOffsets([
      state.edges[0],
      {
        ...state.edges[0],
        id: 'edge-switch-router-return',
        source: 'switch-01',
        target: 'router-01',
        data: {
          ...state.edges[0].data,
          sourcePortIndex: 4,
          targetPortIndex: 2,
        },
      },
    ])

    expect(duplicatedPairOffsets.get('edge-router-switch')).toBe(-9)
    expect(duplicatedPairOffsets.get('edge-switch-router-return')).toBe(9)
  })
})
