# The Rizal Family Archive

A scrollytelling scaffold set in a Philippine old town. José Rizal walks a 3D
road, growing from child to adult, while family members join him one at a time
and HTML bio panels fade in. The character, road, bahay kubo / bahay na bato,
trees and kalesa are a small **react-three-fiber** scene; the rest of the page
is ordinary React + CSS.

Built with **Vite + React + TypeScript**, **GSAP + ScrollTrigger** (scroll), and
**react-three-fiber + drei** (the 3D character/path). No backend, no UI library.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173).

Other scripts:

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

## Deploying to Vercel

Vercel auto-detects Vite, so **no `vercel.json` is needed**. Import the GitHub
repo at vercel.com, accept the detected settings (build `npm run build`, output
`dist`), and deploy. The site is fully static.

## How it works

The whole experience is driven by one value: page scroll progress from 0 to 1.

```
src/
  types.ts                     FamilyMember interface
  data/family.json             12 family members (placeholder content)
  lib/path.ts                  maps rizalAgeAtEncounter -> 0–1 waypoint ranges
                               + getActiveWaypointIndex (the "current" member)
  hooks/usePathProgress.ts     THE primitive: ScrollTrigger -> 0–1 progress
  components/
    RizalScene.tsx             3D: <Canvas>, path curve, Rizal, camera follow
    Waypoint.tsx               HTML bio panel overlay, fades in when active
  App.tsx                      composes the canvas + 12 waypoint panels
```

- **`usePathProgress`** creates a ScrollTrigger spanning the whole document and
  returns its progress. Everything else reads this number — including the 3D
  scene. There is only one scroll system.
- **Waypoint ranges** come from `buildWaypointRanges`: the family's min/max
  `rizalAgeAtEncounter` is mapped onto 0–1, and each member gets a fade window
  around their position. `getActiveWaypointIndex` then picks the single current
  member (the in-range one nearest the center). Because the 12 sections are
  stacked one per screen, the mapped order lines up with the visual order, and
  the panel and the 3D companion always switch together.

### The 3D scene (`RizalScene.tsx`)

Everything here is intentionally primitive geometry — no models, no rigging.

- **Path.** A `THREE.CatmullRomCurve3` (`pathCurve`) through a handful of
  points is the source of truth. The character's position is
  `pathCurve.getPointAt(progress)` and its facing is
  `pathCurve.getTangentAt(progress)` (yaw = `atan2(tangent.x, tangent.z)`).
  The road is a flat ribbon built by sampling the curve and stepping out to
  each side with the perpendicular vector; a dashed `<Line>` marks the centre.
- **Old town.** `Scenery` places `BahayKubo`, `BahayNaBato`, `PalmTree` and
  `LeafyTree` primitives along both sides of the road. Positions are computed
  once from the curve (sample point → step sideways → face the road).
- **Kalesa.** `Kalesa` is a horse (capsules/cylinders) pulling a cart with two
  spinning wheels. It trots along the same curve on a lateral offset, so it
  passes Rizal instead of colliding with him. Wheels spin, legs trot, body
  bobs — all procedural in `useFrame`.
- **Growth.** One shared mesh group per figure. `baseScale + growth * progress`
  gives the target scale and `THREE.MathUtils.damp` eases toward it, so Rizal
  goes child (0.55×) → adult (1.0×). Y grows most; X/Z grow slightly. There are
  no separate child/adult meshes.
- **Walk cycle.** Not a skeletal rig: arms/legs are little groups placed at
  hip/shoulder pivots and rotated with a sine wave in `useFrame`.
- **Companion transition.** `CompanionFlock` keeps a small list of actors. When
  the active member changes, the previous actor is flagged `leaving` (it walks
  ahead along the curve and fades out) and a new actor is added `entering` (it
  walks in from behind and fades in) — see `CompanionActor`. Finished exits are
  removed from the list. Opacity/offset are shared with `Figure` through refs.
- **Camera follow.** `CameraRig` places the camera 7 units behind (along the
  tangent) and 4.5 above the character, damped each frame, and looks at it.
- **Lighting/material.** Exactly one `ambientLight` + one `directionalLight`.
  `MeshStandardMaterial` with slight roughness/metalness variation; the ground
  uses a drei `<GradientTexture>`. No shadow maps — shadows are cheap dark
  circles.

### Layering the HTML panels over the canvas

No text lives inside the 3D scene. The canvas is a fixed, full-viewport layer
with `pointer-events: none`:

```css
.rizal-scene  { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
.waypoints    { position: relative; z-index: 2; }   /* HTML panels on top */
.brand, .progress-bar, .intro { /* z-index: 4–6, above the panels */ }
```

The `<Waypoint>` sections are ordinary block elements in normal document flow,
so the page keeps its natural scroll height (12 × `100vh`) and the existing
progress ranges are unchanged. They just visually sit over the canvas. The
`activeIndex` computed from the same 0–1 progress drives both the panel fade and
which family member appears in the 3D scene.

## Performance notes (mobile)

- **Bundle size.** `three` + r3f + drei push the JS bundle to ~1.1 MB
  (~320 KB gzip) and trigger Vite's 500 KB chunk warning. If mobile load time
  matters, lazy-load the scene:
  `const RizalScene = lazy(() => import('./components/RizalScene'))` in a
  `<Suspense>` boundary, or add a `manualChunks` vendor split in
  `vite.config.ts`.
- **Continuous rendering.** r3f runs a `requestAnimationFrame` loop for the
  walk cycle and camera easing, even when the user is not scrolling. On
  low-end phones this costs battery. Options: stop the walk when off-screen,
  or switch to a lower walk speed.
- **Pixel ratio.** The canvas is capped at `dpr={[1, 1.5]}`. Dropping to
  `[1, 1]` on mobile roughly halves fill cost; raising to `[1, 2]` looks sharper
  on desktop.
- **No re-render on scroll.** App passes a `progressRef` (not a number) into the
  memoized `<RizalScene>`, so scrolling never re-renders the 3D tree — the frame
  loop reads the ref. The HTML overlays (intro, progress bar, panels) still
  re-render, which is cheap.
- **Draw calls.** The scenery is many separate primitives (roughly 10 houses +
  16 trees + 2 kalesa ≈ 150 meshes). Each is a draw call, which is the main
  mobile cost here. If it stutters, merge static scenery with
  `BufferGeometryUtils.mergeGeometries`, use `InstancedMesh` for trees, or trim
  `HOUSE_SPECS` / `TREE_SPECS`.
- **Geometry budget.** The road ribbon (160 segments) and capsules are tiny. If
  you add detailed art later, watch triangle counts and avoid real shadow maps.
- **Companion actors.** Each transition briefly runs 2 figures (one fading out,
  one in). Scrubbing quickly can stack a few fading actors for under a second;
  harmless, but you could cap the list if needed.

## Still placeholder — fill these in next

1. **Art assets.** The town is primitive boxes/cones/capsules (bahay kubo,
   bahay na bato, palms, leafy trees, kalesa). Replace with modelled/textured
   art when ready — keep it light. The ground is a gradient.
2. **Layout.** `PATH_POINTS` and `HOUSE_SPECS` / `TREE_SPECS` in
   `RizalScene.tsx` are hand-placed. Move them to match the real town design.
3. **Bio text.** Every `bioSummary` in `family.json` is clearly marked
   "Placeholder bio". Replace with real 2–3 sentence summaries.
4. **Sources.** All `sources` are `https://example.org/placeholder/...`.
   Replace with real URLs.
5. **Years.** Birth/death years are best-effort and should be verified.
6. **Pacing.** Waypoint fade windows use a fixed `halfWindow` of 0.06 in
   `lib/path.ts`; tune once real content lengths are known.
7. **Mobile / reduced motion.** The scene ignores `prefers-reduced-motion`
   entirely. At minimum, skip the walk cycle and camera easing when it is set.
8. **Walk-cycle sync.** Rizal and the companion use different `phase` values but
   the same speed; tune if the gaits look too matched.
