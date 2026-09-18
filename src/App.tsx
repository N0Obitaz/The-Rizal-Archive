import { useRef } from 'react'
import type { FamilyMember } from './types'
import familyData from './data/family.json'
import { buildWaypointRanges, getActiveWaypointIndex } from './lib/path'
import { usePathProgress } from './hooks/usePathProgress'
import { RizalScene } from './components/RizalScene'
import { Waypoint } from './components/Waypoint'

// The JSON is typed via our FamilyMember interface. Waypoint ranges are
// derived once from rizalAgeAtEncounter, so layout and animation agree.
const family = familyData as FamilyMember[]
const waypoints = buildWaypointRanges(family)

export default function App() {
  // The central primitive: 0 at the top of the page, 1 at the bottom.
  // Unchanged — the same value now also drives the 3D scene.
  const progress = usePathProgress()

  // Mirror progress into a ref. The 3D scene reads the ref inside its frame
  // loop, so scrolling does NOT re-render the <Canvas> subtree.
  const progressRef = useRef(0)
  progressRef.current = progress

  // Which waypoint is current right now. Both the bio panel and the walking
  // companion read from this, so they always switch together.
  const activeIndex = getActiveWaypointIndex(waypoints, progress)
  const companion = activeIndex >= 0 ? waypoints[activeIndex].member : null

  // Title card fades out over the first sliver of the scroll.
  const introOpacity = Math.max(0, 1 - progress / 0.08)

  return (
    <div className="app">
      {/* Layer 0: fixed 3D canvas (Rizal + path/ground). It is `position:
          fixed` behind everything and has pointer-events: none. */}
      <RizalScene progressRef={progressRef} companion={companion} />

      {/* Layer 2: the scrolling HTML panels sit ON TOP of the canvas. They are
          plain absolutely-flowed sections (z-index above the canvas) and still
          use the same progress ranges as before — no text lives in the 3D
          scene. See the "Layering" note in README.md. */}
      <main className="waypoints">
        {/* Hero section: appears first, scrolls away to reveal the first card. */}
        <div className="intro" style={{ opacity: introOpacity }}>
          <p className="intro__eyebrow">A scrollytelling archive</p>
          <h1 className="intro__title">Walk with José</h1>
          <p className="intro__text">
            Scroll to follow Rizal from childhood to adulthood as he meets his
            family along the path.
          </p>
          <p className="intro__hint">Scroll ↓</p>
        </div>

        {waypoints.map(({ member }, index) => (
          <Waypoint
            key={member.id}
            member={member}
            index={index}
            isActive={index === activeIndex}
          />
        ))}
      </main>

      {/* Fixed UI chrome (also above the canvas) */}
      <header className="brand">
        <span className="brand__title">The Rizal Family Archive</span>
      </header>

      <div className="progress-bar" aria-hidden="true">
        <div className="progress-bar__fill" style={{ transform: `scaleX(${progress})` }} />
      </div>
    </div>
  )
}
