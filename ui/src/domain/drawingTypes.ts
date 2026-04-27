import type { Node } from '@xyflow/react'

import type { PurdueLevel, SecurityLevel, TopologyView } from './topologyTypes'

export type DrawingKind = 'zone' | 'rectangle' | 'ellipse' | 'text'

export type DrawingNodeData = {
  kind: DrawingKind
  label: string
  color: string
  height: number
  view: TopologyView
  width: number
  onResizeEnd?: (width: number, height: number) => void
  purdueLevel?: PurdueLevel
  securityLevel?: SecurityLevel
}

export type DrawingNode = Node<DrawingNodeData, 'drawing'>
