export interface Point {
  x: number
  y: number
}

export interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

const EPSILON = 0.01

function rectCenter(r: Rect): Point {
  return { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 }
}

function pathLength(path: Point[]): number {
  let len = 0
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
  }
  return len
}

function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1x = p2.x - p1.x; const d1y = p2.y - p1.y
  const d2x = q2.x - q1.x; const d2y = q2.y - q1.y
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return false
  const dx = q1.x - p1.x; const dy = q1.y - p1.y
  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross
  return t > EPSILON && t < 1 - EPSILON && u > EPSILON && u < 1 - EPSILON
}

function hasCollision(path: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    for (const obs of obstacles) {
      const edges: [Point, Point][] = [
        [{ x: obs.x1, y: obs.y1 }, { x: obs.x2, y: obs.y1 }],
        [{ x: obs.x2, y: obs.y1 }, { x: obs.x2, y: obs.y2 }],
        [{ x: obs.x2, y: obs.y2 }, { x: obs.x1, y: obs.y2 }],
        [{ x: obs.x1, y: obs.y2 }, { x: obs.x1, y: obs.y1 }],
      ]
      for (const [qs, qe] of edges) {
        if (segmentsIntersect(path[i], path[i + 1], qs, qe)) return true
      }
    }
  }
  return false
}

function chooseOptimalConnectionPoints(
  from: Rect,
  to: Rect,
): { start: Point; end: Point } {
  const fc = rectCenter(from)
  const tc = rectCenter(to)
  const dx = tc.x - fc.x
  const dy = tc.y - fc.y

  if (dx >= 0 && dy >= 0) {
    return { start: { x: from.x2, y: from.y2 }, end: { x: to.x1, y: to.y1 } }
  }
  if (dx < 0 && dy >= 0) {
    return { start: { x: from.x1, y: from.y2 }, end: { x: to.x2, y: to.y1 } }
  }
  if (dx >= 0 && dy < 0) {
    return { start: { x: from.x2, y: from.y1 }, end: { x: to.x1, y: to.y2 } }
  }
  return { start: { x: from.x1, y: from.y1 }, end: { x: to.x2, y: to.y2 } }
}

function rectIntersectsPath(obs: Rect, path: Point[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const edges: [Point, Point][] = [
      [{ x: obs.x1, y: obs.y1 }, { x: obs.x2, y: obs.y1 }],
      [{ x: obs.x2, y: obs.y1 }, { x: obs.x2, y: obs.y2 }],
      [{ x: obs.x2, y: obs.y2 }, { x: obs.x1, y: obs.y2 }],
      [{ x: obs.x1, y: obs.y2 }, { x: obs.x1, y: obs.y1 }],
    ]
    for (const [qs, qe] of edges) {
      if (segmentsIntersect(path[i], path[i + 1], qs, qe)) return true
    }
  }
  return false
}

const MAX_ITERATIONS = 10

export function findOptimalPath(
  from: Rect,
  to: Rect,
  obstacles: Rect[],
): Point[] {
  const { start, end } = chooseOptimalConnectionPoints(from, to)

  const straight: Point[] = [start, end]
  if (!hasCollision(straight, obstacles)) return straight

  const gap = 30
  const l1 = [start, { x: start.x, y: end.y }, end]
  if (!hasCollision(l1, obstacles)) return l1

  const l2 = [start, { x: end.x, y: start.y }, end]
  if (!hasCollision(l2, obstacles)) return l2

  const offsets = [gap, -gap, gap * 2, -gap * 2]
  for (const ox of offsets) {
    for (const oy of offsets) {
      const path = [start, { x: start.x + ox, y: start.y + oy }, end]
      if (!hasCollision(path, obstacles)) return path
    }
  }

  let best: Point[] = [start, end]
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let hitObs: Rect | null = null
    for (const obs of obstacles) {
      if (rectIntersectsPath(obs, best)) { hitObs = obs; break }
    }
    if (!hitObs) return best

    const corners = [
      { x: hitObs.x1, y: hitObs.y1 },
      { x: hitObs.x2, y: hitObs.y1 },
      { x: hitObs.x2, y: hitObs.y2 },
      { x: hitObs.x1, y: hitObs.y2 },
    ]

    let bestLocal: Point[] | null = null
    let bestDist = Infinity

    for (const corner of corners) {
      const margin = 15
      const escapes = [
        { x: corner.x - margin, y: corner.y - margin },
        { x: corner.x + margin, y: corner.y - margin },
        { x: corner.x + margin, y: corner.y + margin },
        { x: corner.x - margin, y: corner.y + margin },
        { x: corner.x, y: corner.y - margin },
        { x: corner.x + margin, y: corner.y },
        { x: corner.x, y: corner.y + margin },
        { x: corner.x - margin, y: corner.y },
      ]

      for (const esc of escapes) {
        const detour = [start, esc, end]
        if (!hasCollision(detour, obstacles)) {
          const d = pathLength(detour)
          if (d < bestDist) { bestDist = d; bestLocal = detour }
        }
      }
    }

    if (bestLocal) best = bestLocal
    else break
  }

  if (!hasCollision(best, obstacles)) return best

  const minX = Math.min(...obstacles.map((o) => o.x1), from.x1, to.x1)
  const edgeMargin = 20
  const edgeX = Math.max(0, minX - edgeMargin)
  const edgePath: Point[] = [
    start,
    { x: edgeX, y: start.y },
    { x: edgeX, y: end.y },
    end,
  ]
  return edgePath
}
