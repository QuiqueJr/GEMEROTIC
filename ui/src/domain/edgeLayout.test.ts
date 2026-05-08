import { describe, expect, it } from 'vitest'

import { assetCatalog } from './assetCatalog'
import {
  createBuilderEdge,
  createInitialBuilderState,
  createNodeFromAsset,
} from './topologyBuilder'
import { getEdgeHandleIds, getSiblingOffsets } from './edgeLayout'
import type { BuilderState } from './topologyTypes'

function createDemoBuilderState(): BuilderState {
  const state = createInitialBuilderState()
  state.nodes = [
    createNodeFromAsset(assetCatalog[0], 0, { x: 120, y: 150 }),
    createNodeFromAsset(assetCatalog[1], 0, { x: 400, y: 150 }),
  ]
  state.edges = [
    createBuilderEdge({
      id: 'edge-router-switch',
      source: 'router-01',
      target: 'switch-01',
      sourcePortIndex: 0,
      targetPortIndex: 0,
    }),
  ]
  return state
}

describe('edgeLayout', () => {
  it('elige handles laterales cuando los equipos estan alineados horizontalmente', () => {
    const state = createDemoBuilderState()
    const sourceNode = state.nodes[0]
    const targetNode = state.nodes[1]

    expect(getEdgeHandleIds(sourceNode, targetNode)).toEqual({
      sourceHandle: 'right',
      targetHandle: 'left',
    })
  })

  it('elige handles verticales cuando el destino queda por debajo', () => {
    const state = createDemoBuilderState()
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
    const state = createDemoBuilderState()
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
