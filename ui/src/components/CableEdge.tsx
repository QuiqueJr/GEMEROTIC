import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

import type { BuilderEdge } from '../domain/topologyTypes'

export function CableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
  style,
}: EdgeProps<BuilderEdge>) {
  const geometry = buildCableGeometry(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.siblingOffset ?? 0,
    data?.routeOffset ?? 0,
  )

  return (
    <>
      <BaseEdge id={id} interactionWidth={28} markerEnd={markerEnd} path={geometry.path} style={style} />
      <circle
        className="cable-edge__terminal"
        cx={geometry.points[0].x}
        cy={geometry.points[0].y}
        r="4"
      />
      <circle
        className="cable-edge__terminal"
        cx={geometry.points[3].x}
        cy={geometry.points[3].y}
        r="4"
      />
      <EdgeLabelRenderer>
        {data?.displayLabel ? (
          <div
            className="cable-edge__label nodrag nopan"
            style={{
              left: geometry.center.x,
              top: geometry.center.y,
            }}
          >
            {data.displayLabel}
          </div>
        ) : null}
        {data?.showPortLabels && data.sourcePortName ? (
          <div
            className="cable-edge__port-label nodrag nopan"
            style={{
              left: geometry.sourceLabel.x,
              top: geometry.sourceLabel.y,
            }}
          >
            {data.sourcePortName}
          </div>
        ) : null}
        {data?.showPortLabels && data.targetPortName ? (
          <div
            className="cable-edge__port-label nodrag nopan"
            style={{
              left: geometry.targetLabel.x,
              top: geometry.targetLabel.y,
            }}
          >
            {data.targetPortName}
          </div>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}

function buildCableGeometry(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  siblingOffset: number,
  routeOffset: number,
) {
  const offsetPoints = applyParallelOffset(sourceX, sourceY, targetX, targetY, siblingOffset)
  const points = buildOrthogonalPoints(
    offsetPoints.sourceX,
    offsetPoints.sourceY,
    offsetPoints.targetX,
    offsetPoints.targetY,
    routeOffset,
  )
  return {
    path: pointsToPath(points),
    points,
    center: midpoint(points[1], points[2]),
    sourceLabel: midpoint(points[0], points[1]),
    targetLabel: midpoint(points[2], points[3]),
  }
}

function applyParallelOffset(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  siblingOffset: number,
) {
  const deltaX = targetX - sourceX
  const deltaY = targetY - sourceY
  const distance = Math.hypot(deltaX, deltaY) || 1
  const normalX = (-deltaY / distance) * siblingOffset
  const normalY = (deltaX / distance) * siblingOffset

  return {
    sourceX: sourceX + normalX,
    sourceY: sourceY + normalY,
    targetX: targetX + normalX,
    targetY: targetY + normalY,
  }
}

function buildOrthogonalPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  routeOffset: number,
) {
  if (Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY)) {
    const middleX = sourceX + (targetX - sourceX) / 2 + routeOffset
    return [
      { x: sourceX, y: sourceY },
      { x: middleX, y: sourceY },
      { x: middleX, y: targetY },
      { x: targetX, y: targetY },
    ]
  }

  const middleY = sourceY + (targetY - sourceY) / 2 + routeOffset
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: middleY },
    { x: targetX, y: middleY },
    { x: targetX, y: targetY },
  ]
}

function pointsToPath(points: Array<{ x: number; y: number }>): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`)
    .join(' ')
}

function midpoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return {
    x: left.x + (right.x - left.x) / 2,
    y: left.y + (right.y - left.y) / 2,
  }
}
