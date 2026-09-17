import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { GradientTexture, Line, useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { FamilyMember } from '../types'
import rizalModelUrl from '../model/source/rizal2.glb?url'

/**
 * RizalScene — a deliberately small react-three-fiber scene that replaces the
 * old flat CSS/SVG character. Only two things are 3D here:
 *   1. the ground + road + old-town scenery (houses, trees, kalesa)
 *   2. Rizal (and the current family member as a walking companion)
 *
 * Everything else in the app is untouched: the HTML intro, progress bar and
 * Waypoint bio panels are layered on top of this canvas (see index.css /
 * App.tsx comments).
 *
 * Scroll comes from the existing `usePathProgress` hook. App passes a **ref**
 * rather than a number so scrolling never re-renders the 3D tree; `useFrame`
 * reads `progressRef.current` each frame.
 */

// ---------------------------------------------------------------------------
// The path. A city-style grid of straight road segments meeting at 90° turns.
//
// We build a THREE.CurvePath from LineCurve3 segments (not a smooth Catmull-Rom)
// so every stretch of road is dead straight and every junction is a sharp
// corner. This is still the single source of truth for where the road goes and
// where characters sit — the rest of the scene just consumes `pathCurve`.
// ---------------------------------------------------------------------------
const ROAD_WIDTH = 7
const ROAD_HALF = ROAD_WIDTH / 2
const SIDEWALK_WIDTH = 2
/** Distance from the road centreline to the outer edge of the sidewalk. */
const SIDEWALK_OUTER = ROAD_HALF + SIDEWALK_WIDTH

// Corner nodes of the grid, in order. Each consecutive pair is one straight
// street; every turn between them is exactly 90°.
const PATH_NODES = [
  new THREE.Vector3(-30, 0.05, 14),
  new THREE.Vector3(-6, 0.05, 14),
  new THREE.Vector3(-6, 0.05, -10),
  new THREE.Vector3(10, 0.05, -10),
  new THREE.Vector3(10, 0.05, 14),
  new THREE.Vector3(30, 0.05, 14),
]

const pathCurve = new THREE.CurvePath<THREE.Vector3>()
for (let i = 0; i < PATH_NODES.length - 1; i++) {
  pathCurve.add(new THREE.LineCurve3(PATH_NODES[i], PATH_NODES[i + 1]))
}

/**
 * One straight street: its start/end, unit direction, sideways (perpendicular
 * "right") vector and length. The road and every scenery row are laid out from
 * these, so nothing depends on sampling a curve.
 */
interface RoadSegment {
  start: THREE.Vector3
  end: THREE.Vector3
  dir: THREE.Vector3
  right: THREE.Vector3
  length: number
}

const ROAD_SEGMENTS: RoadSegment[] = PATH_NODES.slice(0, -1).map((start, i) => {
  const end = PATH_NODES[i + 1]
  const delta = new THREE.Vector3().subVectors(end, start)
  const length = delta.length()
  const dir = delta.clone().normalize()
  const right = new THREE.Vector3(-dir.z, 0, dir.x)
  return { start, end, dir, right, length }
})

// Camera height offset over the followed point.
const CAMERA_HEIGHT = new THREE.Vector3(0, 4.5, 0)

// Walk cycle: radians of limb swing per world unit travelled. Bigger = faster
// stepping for the same scroll. The cycle only advances while moving, so the
// figure is still whenever the page is not being scrolled.
const WALK_PHASE_PER_UNIT = 3.5

// Companion placement. Companions walk in from the sidewalk on one side of the
// street, cross to stand just behind Rizal, and on the way out they walk back
// to the curb and only fade once they have stepped away to the side.
const COMPANION_SLOT_OFFSET = -0.012
const COMPANION_SLOT_LATERAL = -1.2
const COMPANION_SIDEWALK_LATERAL = ROAD_HALF + SIDEWALK_WIDTH / 2
const COMPANION_ENTER_DURATION = 1.3
const COMPANION_LEAVE_DURATION = 1.7

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Frame-rate-independent shortest-path angle damping (for 90° turns). */
function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * delta))
}

/** Cheap deterministic hash so each family member gets a stable tint/phase. */
function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** A warm brown, slightly different per person. */
function colorForMember(member: FamilyMember): string {
  const hue = 20 + (hashString(member.id) % 25)
  const color = new THREE.Color()
  color.setHSL(hue / 360, 0.32, 0.33)
  return `#${color.getHexString()}`
}

/** Shared, disposed material so each scenery piece makes one material. */
function useStaticMaterial(color: string, roughness = 0.85, metalness = 0.05) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    [color, roughness, metalness],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

// ---------------------------------------------------------------------------
// Geometry + texture helpers
// ---------------------------------------------------------------------------

/**
 * Build a hip-roof BufferGeometry: a box-like house roof with 4 sloping faces
 * meeting at a central ridge line (not a single pyramid point). The ridge runs
 * along the x-axis and is `ridgeFraction` of the full width.
 *
 *   R0-------R1      ← ridge
 *  /|      /|
 * C0--C1--C2--C3     ← eave corners
 *
 * Faces: front trapezoid, back trapezoid, left triangle, right triangle,
 *        bottom rectangle.
 */
function createHipRoof(
  width: number,
  depth: number,
  height: number,
  ridgeFraction = 0.4,
): THREE.BufferGeometry {
  const hw = width / 2
  const hd = depth / 2
  const rr = hw * ridgeFraction

  // 6 vertices: 4 eave corners (y=0) + 2 ridge endpoints (y=height).
  const positions = new Float32Array([
    -hw, 0, -hd, // 0 back-left
     hw, 0, -hd, // 1 back-right
     hw, 0,  hd, // 2 front-right
    -hw, 0,  hd, // 3 front-left
    -rr, height, 0, // 4 ridge-left
     rr, height, 0, // 5 ridge-right
  ])

  // CCW winding verified so normals face outward for each face.
  const indices = [
    3, 2, 5, 3, 5, 4, // front trapezoid (z+)
    1, 0, 4, 1, 4, 5, // back trapezoid  (z-)
    0, 3, 4,           // left triangle   (x-)
    2, 1, 5,           // right triangle  (x+)
    0, 1, 2, 0, 2, 3, // bottom rectangle
  ]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Procedural rocky/cobblestone texture for the road surface: irregular stone
 * cells separated by darker mortar, plus a light speckle so it reads as stone.
 */
function createRockyTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Mortar base.
  ctx.fillStyle = '#5f5346'
  ctx.fillRect(0, 0, size, size)

  // Stones on a jittered grid — each an irregular polygon in a grey-brown.
  const cells = 8
  const cell = size / cells
  for (let gy = 0; gy < cells; gy++) {
    for (let gx = 0; gx < cells; gx++) {
      const cx = (gx + 0.5) * cell + (Math.random() - 0.5) * cell * 0.4
      const cy = (gy + 0.5) * cell + (Math.random() - 0.5) * cell * 0.4
      const radius = cell * (0.3 + Math.random() * 0.16)
      const shade = 118 + Math.floor(Math.random() * 68)

      ctx.beginPath()
      const verts = 8
      for (let v = 0; v <= verts; v++) {
        const angle = (v / verts) * Math.PI * 2
        const r = radius * (0.72 + Math.random() * 0.42)
        const px = cx + Math.cos(angle) * r
        const py = cy + Math.sin(angle) * r
        if (v === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 20})`
      ctx.fill()
      // Soft highlight edge so stones look rounded.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // Fine speckle to break up the flat fills.
  const imageData = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < imageData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + n))
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + n))
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + n))
  }
  ctx.putImageData(imageData, 0, 0)

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

/**
 * Procedural concrete texture for the sidewalks: light grey with speckle and a
 * couple of faint expansion-joint lines.
 */
function createConcreteTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#b5ada0'
  ctx.fillRect(0, 0, size, size)

  const imageData = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < imageData.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + n))
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + n))
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + n))
  }
  ctx.putImageData(imageData, 0, 0)

  // Faint expansion-joint lines.
  ctx.strokeStyle = 'rgba(90, 84, 76, 0.4)'
  ctx.lineWidth = 2
  for (let i = 1; i < 3; i++) {
    const p = (i / 3) * size
    ctx.beginPath()
    ctx.moveTo(0, p)
    ctx.lineTo(size, p)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, size)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

// ---------------------------------------------------------------------------
// Ground + road
// ---------------------------------------------------------------------------

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[300, 200]} />
      {/* MeshStandardMaterial for the subtle lit look; a gradient texture
          stands in for real ground art. */}
      <meshStandardMaterial roughness={1} metalness={0}>
        <GradientTexture
          stops={[0, 0.5, 1]}
          colors={['#cdb08a', '#e4d0ab', '#c9a97e']}
          size={256}
        />
      </meshStandardMaterial>
    </mesh>
  )
}

/**
 * Build a continuous, mitred sidewalk slab for one side of the whole path.
 *
 * At each node we take the "miter" point — the intersection of the two offset
 * lines meeting there. For our 90° turns that is simply
 * `node + side * offset * (rightOfIncoming + rightOfOutgoing)` (the two ends use
 * their single segment's right vector). Building one slab per side, with a top
 * face plus inner/outer curb faces, means the sidewalks wrap corners with no
 * gaps or mismatched pieces.
 */
function createSidewalkGeometry(sideSign: number): THREE.BufferGeometry {
  const innerD = ROAD_HALF
  const outerD = SIDEWALK_OUTER
  const topY = 0.18
  const botY = 0

  const innerTop: THREE.Vector3[] = []
  const outerTop: THREE.Vector3[] = []

  for (let j = 0; j < PATH_NODES.length; j++) {
    let rx: number
    let rz: number
    if (j === 0) {
      const r = ROAD_SEGMENTS[0].right
      rx = r.x
      rz = r.z
    } else if (j === PATH_NODES.length - 1) {
      const r = ROAD_SEGMENTS[ROAD_SEGMENTS.length - 1].right
      rx = r.x
      rz = r.z
    } else {
      const a = ROAD_SEGMENTS[j - 1].right
      const b = ROAD_SEGMENTS[j].right
      rx = a.x + b.x
      rz = a.z + b.z
    }
    const n = PATH_NODES[j]
    innerTop.push(new THREE.Vector3(n.x + sideSign * innerD * rx, topY, n.z + sideSign * innerD * rz))
    outerTop.push(new THREE.Vector3(n.x + sideSign * outerD * rx, topY, n.z + sideSign * outerD * rz))
  }

  const positions: number[] = []
  const uvs: number[] = []

  // World-space UVs keep the concrete grid aligned across every slab.
  const pushVertex = (v: THREE.Vector3) => {
    positions.push(v.x, v.y, v.z)
    uvs.push(v.x / 2, v.z / 2)
  }
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    pushVertex(a); pushVertex(b); pushVertex(c)
    pushVertex(a); pushVertex(c); pushVertex(d)
  }

  for (let j = 0; j < PATH_NODES.length - 1; j++) {
    const it0 = innerTop[j]
    const it1 = innerTop[j + 1]
    const ot0 = outerTop[j]
    const ot1 = outerTop[j + 1]

    // Top surface.
    pushQuad(it0, ot0, ot1, it1)

    // Vertical curb faces down to the ground.
    const ib0 = new THREE.Vector3(it0.x, botY, it0.z)
    const ib1 = new THREE.Vector3(it1.x, botY, it1.z)
    const ob0 = new THREE.Vector3(ot0.x, botY, ot0.z)
    const ob1 = new THREE.Vector3(ot1.x, botY, ot1.z)
    pushQuad(it1, it0, ib0, ib1) // inner face (toward the road)
    pushQuad(ot0, ot1, ob1, ob0) // outer face
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The road is one stone slab per straight segment, extended half a road-width
 * at both ends so perpendicular slabs overlap and fill each junction. The
 * sidewalks are two continuous mitred ribbons (see createSidewalkGeometry).
 */
function Road() {
  const rockTexture = useMemo(() => createRockyTexture(512), [])
  const concreteTexture = useMemo(() => createConcreteTexture(256), [])

  // One textured material per segment (texture repeat is per-slab so the stone
  // keeps a constant scale no matter how long the street is).
  const roadMaterials = useMemo(
    () =>
      ROAD_SEGMENTS.map((seg) => {
        const map = rockTexture.clone()
        map.needsUpdate = true
        map.wrapS = map.wrapT = THREE.RepeatWrapping
        map.repeat.set(ROAD_WIDTH / 2.5, (seg.length + ROAD_WIDTH) / 2.5)
        return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 })
      }),
    [rockTexture],
  )

  const sidewalkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: concreteTexture,
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [concreteTexture],
  )

  const sidewalkGeometries = useMemo(
    () => [createSidewalkGeometry(1), createSidewalkGeometry(-1)],
    [],
  )

  useEffect(
    () => () => {
      rockTexture.dispose()
      concreteTexture.dispose()
      roadMaterials.forEach((m) => { m.map?.dispose(); m.dispose() })
      sidewalkMaterial.dispose()
      sidewalkGeometries.forEach((g) => g.dispose())
    },
    [rockTexture, concreteTexture, roadMaterials, sidewalkMaterial, sidewalkGeometries],
  )

  // Centre line runs node-to-node, so it turns with every 90° corner.
  const centreLine = useMemo(
    () => PATH_NODES.map((n) => [n.x, 0.07, n.z] as [number, number, number]),
    [],
  )

  return (
    <>
      {ROAD_SEGMENTS.map((seg, i) => {
        const mid = new THREE.Vector3().addVectors(seg.start, seg.end).multiplyScalar(0.5)
        const rotationY = Math.atan2(seg.dir.x, seg.dir.z)
        return (
          <mesh
            key={i}
            position={[mid.x, 0.03, mid.z]}
            rotation={[0, rotationY, 0]}
            material={roadMaterials[i]}
          >
            <boxGeometry args={[ROAD_WIDTH, 0.06, seg.length + ROAD_WIDTH]} />
          </mesh>
        )
      })}

      {/* Continuous sidewalks that mitre cleanly around every corner. */}
      {sidewalkGeometries.map((g, i) => (
        <mesh key={i} geometry={g} material={sidewalkMaterial} />
      ))}

      {/* Dashed centre line, following the grid through every corner. */}
      <Line
        points={centreLine}
        color="#e8d8b0"
        lineWidth={1.4}
        dashed
        dashSize={0.7}
        gapSize={0.6}
        transparent
        opacity={0.55}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Old-town buildings. All primitive boxes/cylinders/cones.
// ---------------------------------------------------------------------------

/** Bahay kubo: stilt house with a steep thatched pyramid roof. */
function BahayKubo() {
  const wood = useStaticMaterial('#7a4f2a', 0.9)
  const bamboo = useStaticMaterial('#b08a52', 0.9)
  const thatch = useStaticMaterial('#9c7a43', 1)

  return (
    <group>
      {/* Stilts */}
      {[-1.1, 1.1].map((x) =>
        [-0.9, 0.9].map((z) => (
          <mesh key={`${x},${z}`} position={[x, 0.55, z]} material={wood}>
            <cylinderGeometry args={[0.1, 0.1, 1.1, 6]} />
          </mesh>
        )),
      )}
      {/* Floor / body */}
      <mesh position={[0, 1.15, 0]} material={wood}>
        <boxGeometry args={[3, 0.18, 2.4]} />
      </mesh>
      <mesh position={[0, 1.9, 0]} material={bamboo}>
        <boxGeometry args={[2.8, 1.3, 2.2]} />
      </mesh>
      {/* Steep thatched roof (4-sided pyramid) */}
      <mesh position={[0, 3.15, 0]} rotation={[0, Math.PI / 4, 0]} material={thatch}>
        <coneGeometry args={[2.5, 1.6, 4]} />
      </mesh>
    </group>
  )
}

/**
 * Bahay na bato — the large ancestral house from the reference photo.
 * Stone ground floor, wooden upper floor with a wrap-around balcony and
 * capiz-style sliding windows, topped by a wide hip roof.
 */
function BahayNaBato() {
  const stone = useStaticMaterial('#a09488', 0.95)
  const wood = useStaticMaterial('#7a5533', 0.85)
  const dark = useStaticMaterial('#3a2416', 0.8)
  const roofMat = useStaticMaterial('#8a7a6a', 0.9)
  const railing = useStaticMaterial('#4a3020', 0.85)
  const windowFrame = useStaticMaterial('#c8b898', 0.7)

  // Hip roof geometry, disposed on unmount.
  const roofGeo = useMemo(() => createHipRoof(6.2, 4.4, 1.3, 0.35), [])
  useEffect(() => () => roofGeo.dispose(), [roofGeo])

  return (
    <group>
      {/* ---- Ground floor: solid stone ---- */}
      <mesh position={[0, 1.1, 0]} material={stone}>
        <boxGeometry args={[5.5, 2.2, 4.0]} />
      </mesh>
      {/* Front doors */}
      {[-1.4, 0, 1.4].map((x) => (
        <mesh key={x} position={[x, 0.85, 2.02]} material={dark}>
          <boxGeometry args={[0.8, 1.3, 0.1]} />
        </mesh>
      ))}
      {/* Side windows */}
      {[-1.2, 0.4].map((z) => (
        <mesh key={z} position={[2.77, 1.1, z]} material={dark}>
          <boxGeometry args={[0.1, 0.7, 0.55]} />
        </mesh>
      ))}

      {/* ---- Upper floor: wooden, overhanging ---- */}
      <mesh position={[0, 2.85, 0]} material={wood}>
        <boxGeometry args={[5.9, 1.5, 4.3]} />
      </mesh>

      {/* Front capiz windows (light panels with wooden frames) */}
      {[-2.0, -0.7, 0.7, 2.0].map((x) => (
        <group key={x}>
          <mesh position={[x, 2.9, 2.17]} material={windowFrame}>
            <boxGeometry args={[0.7, 1.0, 0.06]} />
          </mesh>
          <mesh position={[x, 2.9, 2.2]} material={dark}>
            <boxGeometry args={[0.04, 1.0, 0.02]} />
          </mesh>
        </group>
      ))}
      {/* Side windows */}
      {[-1.2, 0.2, 1.5].map((z) => (
        <mesh key={z} position={[2.97, 2.9, z]} material={dark}>
          <boxGeometry args={[0.1, 0.7, 0.5]} />
        </mesh>
      ))}

      {/* ---- Balcony: platform + railings wrapping the front ---- */}
      {/* Front platform */}
      <mesh position={[0, 2.05, 2.35]} material={wood}>
        <boxGeometry args={[5.9, 0.1, 0.7]} />
      </mesh>
      {/* Side platforms */}
      <mesh position={[3.15, 2.05, 0]} material={wood}>
        <boxGeometry args={[0.7, 0.1, 4.3]} />
      </mesh>
      <mesh position={[-3.15, 2.05, 0]} material={wood}>
        <boxGeometry args={[0.7, 0.1, 4.3]} />
      </mesh>
      {/* Front railing: vertical posts */}
      {Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} position={[-2.7 + i * 0.41, 2.35, 2.68]} material={railing}>
          <boxGeometry args={[0.04, 0.5, 0.04]} />
        </mesh>
      ))}
      {/* Front railing: horizontal top bar */}
      <mesh position={[0, 2.6, 2.68]} material={railing}>
        <boxGeometry args={[5.6, 0.05, 0.05]} />
      </mesh>
      {/* Side railing posts */}
      {[1, -1].map((side) =>
        Array.from({ length: 8 }).map((_, i) => (
          <mesh
            key={`${side}-${i}`}
            position={[side * 3.48, 2.35, -1.8 + i * 0.55]}
            material={railing}
          >
            <boxGeometry args={[0.04, 0.5, 0.04]} />
          </mesh>
        )),
      )}

      {/* ---- Hip roof (eaves sit flush on the upper floor at y=3.6) ---- */}
      <mesh position={[0, 3.6, 0]} geometry={roofGeo} material={roofMat} />
    </group>
  )
}

/**
 * Acacia (rain tree): the iconic Philippine street tree with a wide,
 * umbrella-shaped canopy. Built from a thick trunk and several overlapping
 * dodecahedrons squashed vertically to form the spreading crown.
 */
function AcaciaTree() {
  const trunk = useStaticMaterial('#4a2e16', 0.95)
  const canopy = useStaticMaterial('#3a6828', 0.95)

  return (
    <group>
      {/* Trunk: thick and relatively short. */}
      <mesh position={[0, 1.6, 0]} material={trunk}>
        <cylinderGeometry args={[0.18, 0.35, 3.2, 8]} />
      </mesh>
      {/* Spreading canopy: several overlapping dodecahedrons, squashed on y
          to give the wide umbrella silhouette. */}
      {[
        { pos: [0, 3.8, 0] as [number, number, number], r: 2.8, sy: 0.45 },
        { pos: [-1.6, 3.5, 0.5] as [number, number, number], r: 1.7, sy: 0.4 },
        { pos: [1.3, 3.6, -0.5] as [number, number, number], r: 1.5, sy: 0.38 },
        { pos: [0.3, 3.7, 1.4] as [number, number, number], r: 1.4, sy: 0.38 },
        { pos: [-0.6, 3.4, -1.3] as [number, number, number], r: 1.5, sy: 0.36 },
      ].map(({ pos, r, sy }, i) => (
        <mesh key={i} position={pos} scale={[1, sy, 1]} material={canopy}>
          <dodecahedronGeometry args={[r, 1]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Kalesa: a horse-drawn carriage. Primitives only. It trots along the road,
// offset to the side so it passes Rizal rather than colliding with him.
// ---------------------------------------------------------------------------
interface KalesaProps {
  speed: number
  phase: number
  lateral: number
  scale?: number
}

function Kalesa({ speed, phase, lateral, scale = 1 }: KalesaProps) {
  const group = useRef<THREE.Group>(null)
  const wheelLeft = useRef<THREE.Group>(null)
  const wheelRight = useRef<THREE.Group>(null)
  const legFL = useRef<THREE.Group>(null)
  const legFR = useRef<THREE.Group>(null)
  const legBL = useRef<THREE.Group>(null)
  const legBR = useRef<THREE.Group>(null)

  const horse = useStaticMaterial('#6b4a2f', 0.8)
  const cart = useStaticMaterial('#5a3a22', 0.8)
  const wheel = useStaticMaterial('#3a2416', 0.7)
  const dark = useStaticMaterial('#2a1c12', 0.9)

  const u = useRef(phase)
  const roll = useRef(0)
  // Smoothed heading so the carriage eases around the 90° corners.
  const yaw = useRef(0)
  const yawReady = useRef(false)
  const point = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    // Advance along the curve and loop. Local +z faces the direction of travel.
    u.current = (u.current + delta * speed + 1) % 1
    pathCurve.getPointAt(u.current, point)
    pathCurve.getTangentAt(u.current, tangent)
    right.set(-tangent.z, 0, tangent.x).normalize()

    if (group.current) {
      group.current.position.set(
        point.x + right.x * lateral,
        0,
        point.z + right.z * lateral,
      )
      const targetYaw = Math.atan2(tangent.x, tangent.z)
      if (!yawReady.current) {
        yaw.current = targetYaw
        yawReady.current = true
      }
      yaw.current = dampAngle(yaw.current, targetYaw, 2.5, delta)
      group.current.rotation.y = yaw.current
    }

    // Wheels spin, legs trot, body bobs.
    roll.current += delta * 7
    if (wheelLeft.current) wheelLeft.current.rotation.x = roll.current
    if (wheelRight.current) wheelRight.current.rotation.x = roll.current
    const swing = Math.sin(roll.current) * 0.5
    if (legFL.current) legFL.current.rotation.x = swing
    if (legFR.current) legFR.current.rotation.x = -swing
    if (legBL.current) legBL.current.rotation.x = -swing
    if (legBR.current) legBR.current.rotation.x = swing
    if (group.current) {
      group.current.position.y = Math.abs(Math.sin(roll.current)) * 0.05
    }
  })

  return (
    <group ref={group} scale={scale}>
      {/* --- Horse (front, +z) --- */}
      <mesh position={[0, 1.0, 0.5]} rotation={[Math.PI / 2, 0, 0]} material={horse}>
        <capsuleGeometry args={[0.28, 0.9, 4, 10]} />
      </mesh>
      <mesh position={[0, 1.35, 1.02]} rotation={[0.6, 0, 0]} material={horse}>
        <cylinderGeometry args={[0.12, 0.16, 0.7, 8]} />
      </mesh>
      <mesh position={[0, 1.66, 1.3]} rotation={[0.4, 0, 0]} material={horse}>
        <capsuleGeometry args={[0.14, 0.3, 4, 8]} />
      </mesh>
      {/* Mane + tail */}
      <mesh position={[0, 1.55, 0.95]} rotation={[0.6, 0, 0]} material={dark}>
        <boxGeometry args={[0.06, 0.5, 0.18]} />
      </mesh>
      <mesh position={[0, 1.05, -0.25]} rotation={[0.5, 0, 0]} material={dark}>
        <cylinderGeometry args={[0.05, 0.09, 0.6, 6]} />
      </mesh>

      {/* Horse legs: pivot groups at the body so rotation swings the leg. */}
      {[
        { ref: legFL, x: -0.18, z: 0.95 },
        { ref: legFR, x: 0.18, z: 0.95 },
        { ref: legBL, x: -0.18, z: 0.1 },
        { ref: legBR, x: 0.18, z: 0.1 },
      ].map((leg, i) => (
        <group key={i} ref={leg.ref} position={[leg.x, 0.75, leg.z]}>
          <mesh position={[0, -0.38, 0]} material={horse}>
            <cylinderGeometry args={[0.07, 0.06, 0.76, 6]} />
          </mesh>
        </group>
      ))}

      {/* Shafts connecting horse to cart */}
      {[-0.28, 0.28].map((x) => (
        <mesh key={x} position={[x, 0.8, -0.35]} rotation={[Math.PI / 2, 0, 0]} material={cart}>
          <cylinderGeometry args={[0.04, 0.04, 1.0, 6]} />
        </mesh>
      ))}

      {/* --- Cart (behind, -z) --- */}
      <mesh position={[0, 0.78, -1.15]} material={cart}>
        <boxGeometry args={[1.15, 0.14, 1.5]} />
      </mesh>
      <mesh position={[0, 1.3, -1.25]} material={cart}>
        <boxGeometry args={[1.0, 0.9, 0.95]} />
      </mesh>
      <mesh position={[0, 1.82, -1.25]} material={wheel}>
        <boxGeometry args={[1.2, 0.1, 1.1]} />
      </mesh>
      <mesh position={[0, 1.05, -0.72]} rotation={[0.35, 0, 0]} material={dark}>
        <boxGeometry args={[0.9, 0.05, 0.5]} />
      </mesh>

      {/* Wheels: pivot groups spin about local x (the axle). */}
      {[
        { ref: wheelLeft, x: -0.66 },
        { ref: wheelRight, x: 0.66 },
      ].map((w, i) => (
        <group key={i} ref={w.ref} position={[w.x, 0.5, -1.15]}>
          <mesh rotation={[0, 0, Math.PI / 2]} material={wheel}>
            <cylinderGeometry args={[0.5, 0.5, 0.12, 16]} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} material={dark}>
            <cylinderGeometry args={[0.12, 0.12, 0.16, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Scenery placement.
//
// Houses and trees are generated in world space directly from the straight road
// segments, instead of by sampling a curve. That keeps every building squarely
// beside its sidewalk and — importantly — keeps trees from landing on top of
// houses: along each street we alternate house / tree slots, then a final
// separation pass drops anything still too close (mainly at the corners, where
// two streets meet).
// ---------------------------------------------------------------------------
type SceneryKind = 'kubo' | 'nabato' | 'acacia'

interface Placement {
  x: number
  z: number
  rotationY: number
  kind: SceneryKind
  scale: number
  /** Approximate footprint radius, used only for overlap rejection. */
  radius: number
}

const SLOT_SPACING = 7
const SLOT_MARGIN = 4.5
/** Gap between the sidewalk's outer edge and the front of a house. */
const HOUSE_SETBACK = 2.5
const HOUSE_DISTANCE = SIDEWALK_OUTER + HOUSE_SETBACK
/** Trees sit in the planting strip just beyond the curb. */
const TREE_DISTANCE = SIDEWALK_OUTER + 1.2

function footprintRadius(kind: SceneryKind, scale: number): number {
  if (kind === 'acacia') return 3.0 * scale
  if (kind === 'nabato') return 3.6 * scale
  return 2.6 * scale
}

function buildScenery(): Placement[] {
  const raw: Placement[] = []
  let slot = 0

  for (const seg of ROAD_SEGMENTS) {
    for (let d = SLOT_MARGIN; d <= seg.length - SLOT_MARGIN; d += SLOT_SPACING) {
      for (const side of [1, -1] as const) {
        // Stagger the two sides so the street doesn't look perfectly mirrored.
        const k = slot + (side === -1 ? 1 : 0)
        const isTree = k % 2 === 1
        const kind: SceneryKind = isTree ? 'acacia' : k % 4 === 0 ? 'nabato' : 'kubo'
        const distance = isTree ? TREE_DISTANCE : HOUSE_DISTANCE
        const scale = (isTree ? 0.9 : 1) + ((k * 7) % 3) * 0.05

        raw.push({
          x: seg.start.x + seg.dir.x * d + seg.right.x * side * distance,
          z: seg.start.z + seg.dir.z * d + seg.right.z * side * distance,
          // Front of the building faces back toward the road centre.
          rotationY: Math.atan2(-seg.right.x * side, -seg.right.z * side),
          kind,
          scale,
          radius: footprintRadius(kind, scale),
        })
      }
      slot++
    }
  }

  // Greedy separation: keep each placement only if it clears the accepted ones.
  const accepted: Placement[] = []
  for (const candidate of raw) {
    const clash = accepted.some((other) => {
      const dx = other.x - candidate.x
      const dz = other.z - candidate.z
      const min = (other.radius + candidate.radius) * 0.9
      return dx * dx + dz * dz < min * min
    })
    if (!clash) accepted.push(candidate)
  }
  return accepted
}

const SCENERY: Placement[] = buildScenery()

function Scenery() {
  return (
    <>
      {SCENERY.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.rotationY, 0]} scale={p.scale}>
          {p.kind === 'kubo' && <BahayKubo />}
          {p.kind === 'nabato' && <BahayNaBato />}
          {p.kind === 'acacia' && <AcaciaTree />}
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// A primitive-built figure. No skeletal rig: the limbs are child groups placed
// at hip/shoulder pivots, and we rotate those groups with a sine wave.
// ---------------------------------------------------------------------------
interface FigureProps {
  progressRef: MutableRefObject<number>
  color: string
  /** Added to progress before sampling the curve. */
  progressOffset?: number
  /** Overrides `progressOffset` when provided (used for animated companions). */
  progressOffsetRef?: MutableRefObject<number>
  /** Sideways offset from the road centre, in world units. */
  lateralOffset?: number
  /** Overrides `lateralOffset` when provided (used for companions). */
  lateralOffsetRef?: MutableRefObject<number>
  baseScale?: number
  growth?: number
  phase?: number
  /** 0–1 master opacity when provided (used to fade companions). */
  opacityRef?: MutableRefObject<number>
}

function Figure({
  progressRef,
  color,
  progressOffset = 0,
  progressOffsetRef,
  lateralOffset = 0,
  lateralOffsetRef,
  baseScale = 1,
  growth = 0,
  phase = 0,
  opacityRef,
}: FigureProps) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legLeft = useRef<THREE.Group>(null)
  const legRight = useRef<THREE.Group>(null)
  const armLeft = useRef<THREE.Group>(null)
  const armRight = useRef<THREE.Group>(null)

  const scale = useRef(baseScale)
  const walkPhase = useRef(phase)
  // Smoothed heading so the figure eases around 90° corners instead of snapping.
  const yaw = useRef(0)
  // Movement tracking: the walk cycle advances by distance travelled (not by
  // wall-clock time), so the figure only steps while it is actually moving —
  // i.e. while the page is being scrolled. `activity` eases the limbs back to
  // neutral when standing still.
  const lastX = useRef<number | null>(null)
  const lastZ = useRef<number | null>(null)
  const activity = useRef(0)

  const point = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])

  // Transparent only when this figure needs to fade (companions).
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.62,
        metalness: 0.18,
        transparent: Boolean(opacityRef),
      }),
    [color, opacityRef],
  )
  const shadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#2b2118',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    [],
  )
  useEffect(
    () => () => {
      material.dispose()
      shadowMaterial.dispose()
    },
    [material, shadowMaterial],
  )

  useFrame((_, delta) => {
    const offset = progressOffsetRef ? progressOffsetRef.current : progressOffset
    const p = clamp01(progressRef.current + offset)
    const lateral = lateralOffsetRef ? lateralOffsetRef.current : lateralOffset

    pathCurve.getPointAt(p, point)
    pathCurve.getTangentAt(p, tangent)
    right.set(-tangent.z, 0, tangent.x).normalize()

    // Where the figure should stand this frame.
    const x = point.x + right.x * lateral
    const z = point.z + right.z * lateral

    let dx = 0
    let dz = 0
    if (group.current) {
      group.current.position.set(x, 0, z)

      // Distance actually moved since the previous frame. This drives both the
      // walk cycle and the facing direction, so lateral entrances/exits animate
      // and turn correctly too — not just forward motion along the path.
      if (lastX.current !== null && lastZ.current !== null) {
        dx = x - lastX.current
        dz = z - lastZ.current
        const moved = Math.hypot(dx, dz)
        if (moved > 1e-4) {
          yaw.current = dampAngle(yaw.current, Math.atan2(dx, dz), 10, delta)
        }
        walkPhase.current += moved * WALK_PHASE_PER_UNIT
      } else {
        // First frame: face along the path so we don't spin up from zero.
        yaw.current = Math.atan2(tangent.x, tangent.z)
      }
      group.current.rotation.y = yaw.current
    }
    lastX.current = x
    lastZ.current = z

    // Ease the limbs toward "walking" while moving and back to "standing" when
    // the page is still, so the figure is never frozen mid-stride.
    const moving = dx * dx + dz * dz > 1e-8
    activity.current = THREE.MathUtils.damp(activity.current, moving ? 1 : 0, 10, delta)

    // Growth: child -> adult. `damp` is a frame-rate-independent lerp.
    const targetScale = baseScale + growth * p
    scale.current = THREE.MathUtils.damp(scale.current, targetScale, 6, delta)
    if (body.current) {
      body.current.scale.set(scale.current * 0.96, scale.current, scale.current * 0.96)
    }

    // Procedural walk — amplitude scales with `activity`.
    const swing = Math.sin(walkPhase.current) * 0.5 * activity.current
    if (legLeft.current) legLeft.current.rotation.x = swing
    if (legRight.current) legRight.current.rotation.x = -swing
    if (armLeft.current) armLeft.current.rotation.x = -swing * 0.7
    if (armRight.current) armRight.current.rotation.x = swing * 0.7

    if (group.current) {
      // Stand on the sidewalk when out past the curb, on the road otherwise.
      const groundY =
        THREE.MathUtils.smoothstep(Math.abs(lateral), ROAD_HALF - 0.25, ROAD_HALF + 0.25) * 0.18
      group.current.position.y =
        groundY + Math.abs(Math.sin(walkPhase.current)) * 0.05 * activity.current
    }

    // Fade everything together (body + blob shadow).
    const opacity = opacityRef ? opacityRef.current : 1
    material.opacity = opacity
    shadowMaterial.opacity = 0.16 * opacity
  })

  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} material={shadowMaterial}>
        <circleGeometry args={[0.6, 20]} />
      </mesh>

      <group ref={body}>
        <mesh position={[0, 1.25, 0]} material={material}>
          <capsuleGeometry args={[0.36, 0.7, 6, 14]} />
        </mesh>
        <mesh position={[0, 2.1, 0]} material={material}>
          <sphereGeometry args={[0.34, 20, 16]} />
        </mesh>

        <group ref={armLeft} position={[-0.45, 1.65, 0]}>
          <mesh position={[0, -0.35, 0]} material={material}>
            <capsuleGeometry args={[0.11, 0.5, 4, 10]} />
          </mesh>
        </group>
        <group ref={armRight} position={[0.45, 1.65, 0]}>
          <mesh position={[0, -0.35, 0]} material={material}>
            <capsuleGeometry args={[0.11, 0.5, 4, 10]} />
          </mesh>
        </group>
        <group ref={legLeft} position={[-0.18, 0.75, 0]}>
          <mesh position={[0, -0.38, 0]} material={material}>
            <capsuleGeometry args={[0.14, 0.45, 4, 10]} />
          </mesh>
        </group>
        <group ref={legRight} position={[0.18, 0.75, 0]}>
          <mesh position={[0, -0.38, 0]} material={material}>
            <capsuleGeometry args={[0.14, 0.45, 4, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Rizal's custom 3D model.
//
// `rizal2.glb` is now a rigged, animated character (Mixamo-style skeleton with
// a single "Walk" clip). We move it along the path and drive the clip's playback
// speed from actual movement, so he only steps while the page is scrolled — no
// synthetic bob/sway is needed.
// ---------------------------------------------------------------------------

/** Target world height (feet to head), i.e. Rizal as an adult. */
const RIZAL_MODEL_HEIGHT = 2.1
/**
 * The rig's forward direction is unknown, so this is a knob: leave at 0 if he
 * faces the way he walks, or set to Math.PI if he moonwalks (faces backwards).
 */
const RIZAL_MODEL_YAW = 0
/** Playback rate of the walk clip while scrolling (1 = the clip's native speed). */
const RIZAL_WALK_RATE = 0.9

function RizalModel({ progressRef }: { progressRef: MutableRefObject<number> }) {
  // Suspends until the .glb has downloaded (see the <Suspense> wrapper).
  const { scene, animations } = useGLTF(rizalModelUrl)

  const group = useRef<THREE.Group>(null)
  // Drives the loaded skeleton. The mixer is advanced automatically each frame.
  const { actions } = useAnimations(animations, group)

  const yaw = useRef(0)
  const lastX = useRef<number | null>(null)
  const lastZ = useRef<number | null>(null)
  const activity = useRef(0)

  const point = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])

  // Normalise the loaded model: scale it to RIZAL_MODEL_HEIGHT and drop its feet
  // onto the ground. Measured from the bind pose so it survives model swaps.
  const { scale: fitScale, feetY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const s = size.y > 0 ? RIZAL_MODEL_HEIGHT / size.y : 1
    return { scale: s, feetY: -box.min.y * s }
  }, [scene])

  // Start the walk clip once, looping. Its speed is controlled per frame below.
  useEffect(() => {
    const action = actions['Walk']
    if (!action) return
    action.reset()
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()
    return () => {
      action.stop()
    }
  }, [actions])

  useFrame((_, delta) => {
    const p = clamp01(progressRef.current)
    pathCurve.getPointAt(p, point)
    pathCurve.getTangentAt(p, tangent)
    right.set(-tangent.z, 0, tangent.x).normalize()

    // Rizal walks the centreline.
    const x = point.x
    const z = point.z

    let moved = 0
    if (group.current) {
      group.current.position.set(x, 0, z)
      if (lastX.current !== null && lastZ.current !== null) {
        const dx = x - lastX.current
        const dz = z - lastZ.current
        moved = Math.hypot(dx, dz)
        if (moved > 1e-4) {
          yaw.current = dampAngle(yaw.current, Math.atan2(dx, dz), 10, delta)
        }
      } else {
        yaw.current = Math.atan2(tangent.x, tangent.z)
      }
      group.current.rotation.y = yaw.current
    }
    lastX.current = x
    lastZ.current = z

    // The skeleton only animates while the page is actually moving: the clip's
    // timeScale eases toward the walk rate when moving and toward 0 when idle.
    const moving = moved > 1e-4
    activity.current = THREE.MathUtils.damp(activity.current, moving ? 1 : 0, 10, delta)
    const action = actions['Walk']
    if (action) {
      const target = activity.current * RIZAL_WALK_RATE
      action.timeScale = THREE.MathUtils.damp(action.timeScale, target, 12, delta)
    }
  })

  return (
    <group ref={group}>
      {/* Blob shadow, matching the silhouette figures. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.6, 20]} />
        <meshBasicMaterial color="#2b2118" transparent opacity={0.16} depthWrite={false} />
      </mesh>

      {/* Scaled to adult height, feet on the ground, facing along the path. */}
      <group position={[0, feetY, 0]} scale={fitScale} rotation={[0, RIZAL_MODEL_YAW, 0]}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

useGLTF.preload(rizalModelUrl)

// ---------------------------------------------------------------------------
// Companion transition.
//
// Companions step out of the sidewalk on one side of the street, cross to stand
// just behind Rizal, and on their way out walk back to the curb and only fade
// once they have stepped away to the side. Each actor owns its own refs and
// reports when its exit finishes so the parent can drop it.
// ---------------------------------------------------------------------------
interface CompanionActorProps {
  member: FamilyMember
  leaving: boolean
  progressRef: MutableRefObject<number>
  onFinished: () => void
}

/** Smoothstep easing for the walk-in / walk-out. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function CompanionActor({ member, leaving, progressRef, onFinished }: CompanionActorProps) {
  // Which sidewalk this member emerges from (stable per person).
  const side = hashString(member.id) % 2 === 0 ? 1 : -1
  const startLateral = side * COMPANION_SIDEWALK_LATERAL

  const opacityRef = useRef(0)
  const lateralRef = useRef(startLateral)
  const enterElapsed = useRef(0)
  const leaveElapsed = useRef(0)
  const finished = useRef(false)

  useFrame((_, delta) => {
    enterElapsed.current += delta
    const enterK = clamp01(enterElapsed.current / COMPANION_ENTER_DURATION)

    let leaveK = 0
    if (leaving) {
      leaveElapsed.current += delta
      leaveK = clamp01(leaveElapsed.current / COMPANION_LEAVE_DURATION)
    }

    // Walk in from the curb to the slot; walk back out to the curb on the way.
    lateralRef.current = leaving
      ? COMPANION_SLOT_LATERAL +
        (startLateral - COMPANION_SLOT_LATERAL) * smoothstep(leaveK)
      : startLateral +
        (COMPANION_SLOT_LATERAL - startLateral) * smoothstep(enterK)

    // Fade in as they set off, but stay solid while leaving and only vanish
    // once they are out by the sidewalk.
    const fadeIn = clamp01(enterK / 0.3)
    const fadeOut = clamp01((leaveK - 0.65) / 0.35)
    opacityRef.current = fadeIn * (1 - fadeOut)

    if (leaving && leaveK >= 1 && !finished.current) {
      finished.current = true
      onFinished()
    }
  })

  return (
    <Figure
      progressRef={progressRef}
      color={colorForMember(member)}
      progressOffset={COMPANION_SLOT_OFFSET}
      lateralOffsetRef={lateralRef}
      opacityRef={opacityRef}
      baseScale={0.92}
      phase={((hashString(member.id) % 100) / 100) * Math.PI * 2}
    />
  )
}

function CompanionFlock({
  companion,
  progressRef,
}: {
  companion?: FamilyMember | null
  progressRef: MutableRefObject<number>
}) {
  const [actors, setActors] = useState<
    Array<{ key: number; member: FamilyMember; leaving: boolean }>
  >([])
  const nextKey = useRef(0)
  const activeId = useRef<string | null>(null)

  useEffect(() => {
    const id = companion ? companion.id : null
    if (id === activeId.current) return
    activeId.current = id

    setActors((current) => {
      // Everyone already on the path starts walking away.
      const leaving = current.map((a) => (a.leaving ? a : { ...a, leaving: true }))
      if (!companion) return leaving
      return [...leaving, { key: nextKey.current++, member: companion, leaving: false }]
    })
  }, [companion])

  const handleFinished = useCallback((key: number) => {
    setActors((current) => current.filter((a) => a.key !== key))
  }, [])

  return (
    <>
      {actors.map((actor) => (
        <CompanionActor
          key={actor.key}
          member={actor.member}
          leaving={actor.leaving}
          progressRef={progressRef}
          onFinished={() => handleFinished(actor.key)}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Camera follow: trails slightly behind and above the character, using the
// path tangent for "behind". Damped so it eases regardless of frame rate.
// ---------------------------------------------------------------------------
function CameraRig({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const camera = useThree((state) => state.camera)

  const point = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])
  const desired = useMemo(() => new THREE.Vector3(), [])
  const focus = useMemo(() => new THREE.Vector3(), [])
  const lookTarget = useRef(new THREE.Vector3(0, 1.5, 0))

  useFrame((_, delta) => {
    const p = clamp01(progressRef.current)
    pathCurve.getPointAt(p, point)
    pathCurve.getTangentAt(p, tangent)

    desired.copy(point).addScaledVector(tangent, -7).add(CAMERA_HEIGHT)

    const t = 1 - Math.exp(-3 * delta)
    camera.position.lerp(desired, t)

    focus.copy(point).setY(1.5)
    lookTarget.current.lerp(focus, t)
    camera.lookAt(lookTarget.current)
  })

  return null
}

// ---------------------------------------------------------------------------
// Everything inside <Canvas>.
// ---------------------------------------------------------------------------
interface SceneContentsProps {
  progressRef: MutableRefObject<number>
  companion?: FamilyMember | null
}

function SceneContents({ progressRef, companion }: SceneContentsProps) {
  return (
    <>
      {/* Warm sky matching the page paper, plus fog to hide the plane's edge. */}
      <color attach="background" args={['#f2e6d0']} />
      <fog attach="fog" args={['#f2e6d0', 24, 92]} />

      {/* Exactly one ambient + one directional light. No shadow maps. */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[6, 12, 6]} intensity={1.5} />

      <Ground />
      <Road />
      <Scenery />

      {/* Kalesa passing along the road, offset so it never hits Rizal. */}
      <Kalesa speed={0.028} phase={0.15} lateral={2.6} scale={1} />
      <Kalesa speed={0.019} phase={0.72} lateral={-2.4} scale={0.95} />

      <CameraRig progressRef={progressRef} />

      {/* Rizal: the custom .glb model at adult height. The silhouette shows
          until the model has downloaded. */}
      <Suspense
        fallback={
          <Figure progressRef={progressRef} color="#2b2118" />
        }
      >
        <RizalModel progressRef={progressRef} />
      </Suspense>

      {/* The currently active relative walks beside him. */}
      <CompanionFlock companion={companion} progressRef={progressRef} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Public component. `memo` + the progress *ref* means scrolling does not
// re-render the 3D tree — the frame loop reads the ref directly.
// ---------------------------------------------------------------------------
export interface RizalSceneProps {
  progressRef: MutableRefObject<number>
  companion?: FamilyMember | null
}

export const RizalScene = memo(function RizalScene({
  progressRef,
  companion,
}: RizalSceneProps) {
  return (
    <div className="rizal-scene" aria-hidden="true">
      <Canvas
        className="rizal-scene__canvas"
        // Cap the device pixel ratio: rendering at 3x on a phone costs a lot
        // for little visual gain. Bump to [1, 2] on desktop if it looks soft.
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 260, position: [-37, 4.5, 14] }}
      >
        <SceneContents progressRef={progressRef} companion={companion} />
      </Canvas>
    </div>
  )
})
