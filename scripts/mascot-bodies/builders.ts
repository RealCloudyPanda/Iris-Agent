/**
 * The Iris character outlines, as absolute cubic path data. Every outline is
 * sampled from a closed parametric curve written here and joined with a
 * Catmull-Rom spline, so each one is original geometry. Cubics only: the
 * phone's path parser understands `M`, `C` and `Z` and nothing else.
 */

export interface BodyDef {
  id: string
  name: string
  /** Absolute cubic path data: `M`, `C` and `Z` only. */
  d: string
  /** Optional decoration drawn over the fill in the outline's own coordinates:
   * kept to the rim so it never sits under the face. */
  detail?: string
  /** `[minX, minY, width, height]` of the nominal canvas, advisory only:
   * bounds come from flattening the path. */
  viewBox: [number, number, number, number]
}

type Sextet = [number, number, number, number, number, number]
type Point = [number, number]

/** A straight run as a degenerate cubic, so the emitted path stays cubics-only. */
function lineToCubic(x0: number, y0: number, x1: number, y1: number): Sextet {
  return [
    x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3,
    x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3,
    x1, y1,
  ]
}

/** Fixed-point, never exponent notation: the iOS parser reads every letter as a
 * command, so a stray `e` would corrupt the outline. */
function fmt(n: number): string {
  let s = n.toFixed(3)
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "")
  return s === "-0" ? "0" : s
}

/** Accumulates `M`/`C`/`Z`, closing the ring with a real cubic rather than leaning on `Z`. */
class Path {
  private parts: string[] = []
  private origin: [number, number] = [0, 0]
  private at: [number, number] = [0, 0]

  moveTo(x: number, y: number): Path {
    this.parts.push("M" + fmt(x) + " " + fmt(y))
    this.origin = [x, y]
    this.at = [x, y]
    return this
  }

  curveTo(c: Sextet): Path {
    this.parts.push("C" + c.map(fmt).join(" "))
    this.at = [c[4], c[5]]
    return this
  }

  lineTo(x: number, y: number): Path {
    return this.curveTo(lineToCubic(this.at[0], this.at[1], x, y))
  }

  close(): string {
    const [x, y] = this.at
    const [sx, sy] = this.origin
    if (Math.abs(x - sx) > 1e-9 || Math.abs(y - sy) > 1e-9) this.lineTo(sx, sy)
    return this.parts.join("") + "Z"
  }
}

const TAU = Math.PI * 2
const C = 100

/** A closed Catmull-Rom spline through `pts`, as exact cubics. */
function spline(pts: Point[]): string {
  const n = pts.length
  const at = (i: number) => pts[(i + n) % n]
  const p = new Path().moveTo(pts[0][0], pts[0][1])
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    p.curveTo([
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    ])
  }
  return p.close()
}

/** Samples a radius function around the stage centre, starting at the top. */
function polar(r: (a: number) => number, steps = 72, sx = 1, sy = 1): string {
  const pts: Point[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU - Math.PI / 2
    const k = r(a)
    pts.push([C + Math.cos(a) * k * sx, C + Math.sin(a) * k * sy])
  }
  return spline(pts)
}

/** A regular polygon with circular corners, sampled densely enough that the
 * spline keeps its sides straight. */
function roundedPolygon(sides: number, radius: number, corner: number, turn: number): string {
  const pts: Point[] = []
  const half = Math.PI / sides
  const inset = corner / Math.cos(half)
  for (let i = 0; i < sides; i++) {
    const v = turn + (i / sides) * TAU
    const cx = C + Math.cos(v) * (radius - inset)
    const cy = C + Math.sin(v) * (radius - inset)
    for (let j = 0; j <= 6; j++) {
      const a = v - half + (j / 6) * 2 * half
      pts.push([cx + Math.cos(a) * corner, cy + Math.sin(a) * corner])
    }
    const next = turn + ((i + 1) / sides) * TAU
    const a0 = v + half, a1 = next - half
    const from: Point = [cx + Math.cos(a0) * corner, cy + Math.sin(a0) * corner]
    const nx = C + Math.cos(next) * (radius - inset), ny = C + Math.sin(next) * (radius - inset)
    const to: Point = [nx + Math.cos(a1) * corner, ny + Math.sin(a1) * corner]
    for (let j = 1; j < 4; j++) pts.push([from[0] + ((to[0] - from[0]) * j) / 4, from[1] + ((to[1] - from[1]) * j) / 4])
  }
  return spline(pts)
}

const n2 = (n: number) => fmt(Math.round(n * 100) / 100)

/** Cream seams and soft highlights, in the brand's cream. */
const CREAM = "#FCF8EA"
const seam = (d: string, width: number, opacity: number) =>
  `<path fill="none" stroke="${CREAM}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" d="${d}"/>`
const shine = (d: string, opacity: number) => `<path fill="#ffffff" fill-opacity="${opacity}" d="${d}"/>`

/** Iris: a disc whose rim carries the six swept blade seams of the app's aperture mark. */
function irisDetail(): string {
  let d = ""
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2
    const r0 = 98, r1 = 70
    const sweep = 0.62
    const x0 = C + Math.cos(a) * r0, y0 = C + Math.sin(a) * r0
    const x1 = C + Math.cos(a + sweep) * r1, y1 = C + Math.sin(a + sweep) * r1
    const mx = C + Math.cos(a + sweep * 0.42) * (r0 - 6), my = C + Math.sin(a + sweep * 0.42) * (r0 - 6)
    d += `M${n2(x0)} ${n2(y0)}Q${n2(mx)} ${n2(my)} ${n2(x1)} ${n2(y1)}`
  }
  const ring = `<circle cx="${C}" cy="${C}" r="91" fill="none" stroke="${CREAM}" stroke-opacity="0.32" stroke-width="3"/>`
  return seam(d, 4.5, 0.55) + ring
}

/** Orb: a glassy crescent of light across the upper left. */
function orbDetail(): string {
  return shine("M38 70C46 42 70 26 98 24C76 34 58 52 50 78C47 86 36 80 38 70Z", 0.42)
}

/** Petal: a short crease between each pair of lobes. */
function petalDetail(lobes: number): string {
  let d = ""
  for (let i = 0; i < lobes; i++) {
    const a = ((i + 0.5) / lobes) * TAU - Math.PI / 2
    d += `M${n2(C + Math.cos(a) * 70)} ${n2(C + Math.sin(a) * 70)}L${n2(C + Math.cos(a) * 60)} ${n2(C + Math.sin(a) * 60)}`
  }
  return seam(d, 4, 0.5)
}

/** Hex: an inner bevel along the top two faces. */
function hexDetail(): string {
  const r = 86
  const pts = [-150, -90, -30].map((deg) => [C + Math.cos((deg * Math.PI) / 180) * r, C + Math.sin((deg * Math.PI) / 180) * r])
  return seam(`M${n2(pts[0][0])} ${n2(pts[0][1])}L${n2(pts[1][0])} ${n2(pts[1][1])}L${n2(pts[2][0])} ${n2(pts[2][1])}`, 4, 0.45)
}

/** Spark: a twinkle of light on the upper point. */
function sparkDetail(): string {
  return shine("M100 14C103 26 106 30 116 33C106 36 103 40 100 52C97 40 94 36 84 33C94 30 97 26 100 14Z", 0.55)
}

/** Drop: a gleam down the left flank. */
function dropDetail(): string {
  return seam("M34 150C42 168 56 180 74 186", 6, 0.42)
}

/** Pebble: two speckles low on the right. */
function pebbleDetail(): string {
  return `<g fill="${CREAM}" fill-opacity="0.45"><circle cx="150" cy="138" r="4.5"/><circle cx="162" cy="124" r="3"/></g>`
}

/** Mochi: a soft shine on the crown. */
function mochiDetail(): string {
  return shine("M56 52C70 36 96 30 118 34C98 40 80 48 66 62C60 68 50 60 56 52Z", 0.38)
}

/** The teardrop: pointed at the top, full at the bottom. */
function dropOutline(): string {
  const pts: Point[] = []
  const steps = 72
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU
    const x = Math.sin(t) * Math.pow(Math.sin(t / 2), 0.7)
    const y = -Math.cos(t)
    pts.push([C + x * 92, C + y * 98])
  }
  return spline(pts)
}

/** Eight outlines, in the order the picker shows them. `iris` is the default, so it leads. */
export const BODY_DEFS: BodyDef[] = [
  { id: "iris", name: "Iris", d: polar((a) => 100 * (1 + 0.008 * Math.cos(6 * a))), detail: irisDetail(), viewBox: [0, 0, 200, 200] },
  { id: "orb", name: "Orb", d: polar(() => 98), detail: orbDetail(), viewBox: [0, 0, 200, 200] },
  { id: "pebble", name: "Pebble", d: polar((a) => 100 * (1 + 0.06 * Math.sin(2 * a + 0.5) + 0.035 * Math.cos(3 * a)), 72, 1, 0.82), detail: pebbleDetail(), viewBox: [0, 0, 200, 200] },
  { id: "hex", name: "Hex", d: roundedPolygon(6, 100, 22, -Math.PI / 2), detail: hexDetail(), viewBox: [0, 0, 200, 200] },
  { id: "drop", name: "Drop", d: dropOutline(), detail: dropDetail(), viewBox: [0, 0, 200, 200] },
  { id: "petal", name: "Petal", d: polar((a) => 100 * (0.88 + 0.12 * Math.cos(5 * a))), detail: petalDetail(5), viewBox: [0, 0, 200, 200] },
  { id: "mochi", name: "Mochi", d: polar((a) => 100 * Math.pow(Math.pow(Math.abs(Math.cos(a)), 3) + Math.pow(Math.abs(Math.sin(a)), Math.sin(a) > 0 ? 4 : 2.2), -1 / 3.2), 96), detail: mochiDetail(), viewBox: [0, 0, 200, 200] },
  { id: "spark", name: "Spark", d: polar((a) => 100 * (0.74 + 0.26 * Math.pow(Math.abs(Math.cos(2 * a)), 3))), detail: sparkDetail(), viewBox: [0, 0, 200, 200] },
]

export const BODY_IDS: string[] = BODY_DEFS.map(s => s.id)
