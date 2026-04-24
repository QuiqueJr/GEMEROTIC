import type { BuilderEdge, BuilderNode } from './topologyTypes'

export type HandleId = 'top' | 'right' | 'bottom' | 'left'

export function getEdgeHandleIds(
  sourceNode: BuilderNode,
  targetNode: BuilderNode,
): {
  sourceHandle: HandleId
  targetHandle: HandleId
} {
  const deltaX = targetNode.position.x - sourceNode.position.x
  const deltaY = targetNode.position.y - sourceNode.position.y

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' }
  }

  return deltaY >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top', targetHandle: 'bottom' }
}

export function getSiblingOffsets(edges: BuilderEdge[]): Map<string, number> {
  const groups = new Map<string, BuilderEdge[]>()
  for (const edge of edges) {
    const groupKey = getSiblingKey(edge)
    const group = groups.get(groupKey) ?? []
    group.push(edge)
    groups.set(groupKey, group)
  }

  const offsets = new Map<string, number>()
  for (const group of groups.values()) {
    const orderedGroup = [...group].sort(compareSiblingEdges)
    const centerIndex = (orderedGroup.length - 1) / 2
    orderedGroup.forEach((edge, index) => {
      offsets.set(edge.id, (index - centerIndex) * 18)
    })
  }

  return offsets
}

function getSiblingKey(edge: Pick<BuilderEdge, 'source' | 'target'>): string {
  return [edge.source, edge.target].sort().join('::')
}

function compareSiblingEdges(left: BuilderEdge, right: BuilderEdge): number {
  return compareTuples(
    [
      left.source,
      left.target,
      left.data?.sourcePortIndex ?? 0,
      left.data?.targetPortIndex ?? 0,
      left.id,
    ],
    [
      right.source,
      right.target,
      right.data?.sourcePortIndex ?? 0,
      right.data?.targetPortIndex ?? 0,
      right.id,
    ],
  )
}

function compareTuples(left: Array<string | number>, right: Array<string | number>): number {
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (leftValue < rightValue) {
      return -1
    }
    if (leftValue > rightValue) {
      return 1
    }
  }
  return 0
}
