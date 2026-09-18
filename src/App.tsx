import { useRef, useState } from 'react'
import type { FamilyMember } from './types'
import familyData from './data/family.json'
import { buildWaypointRanges, getActiveWaypointIndex } from './lib/path'
import { usePathProgress } from './hooks/usePathProgress'
import { RizalScene } from './components/RizalScene'
import { Waypoint } from './components/Waypoint'

// The JSON is typed via our FamilyMember interface. Waypoint ranges are
// derived once from rizalAgeAtEncounter, so layout and animation agree.
const family = familyData as FamilyMember[]

export default function App() {
  const progressRef = useRef(0)

  // The central primitive: 0 at the top of the page, 1 at the bottom.
  // Unchanged — the same value now also drives the 3D scene.
  const progress = usePathProgress()

  // Mirror progress into the ref. The 3D scene reads the ref inside its frame
  // loop, so scrolling does NOT re-render the <Canvas> subtree.
  progressRef.current = progress

  // Which waypoint is current right now. Both the bio panel and the walking
  // companion read from this, so they always switch together.
  const waypoints = buildWaypointRanges(family)
  const activeIndex = getActiveWaypointIndex(waypoints, progress)
  const companion = activeIndex >= 0 ? waypoints[activeIndex].member : null

  // Title card fades out over the first sliver of the scroll.
  const introOpacity = Math.max(0, 1 - progress / 0.08)

  // Summary section state: visible after walking section ends
  const [showSummary, setShowSummary] = useState(false)

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

        {/* Fixed UI chrome (also above the canvas) */}
        <header className="brand">
          <span className="brand__title">The Rizal Family Archive</span>
        </header>

        <div className="progress-bar" aria-hidden="true">
          <div className="progress-bar__fill" style={{ transform: `scaleX(${progress})` }} />
        </div>

        <div className="intro" style={{ opacity: introOpacity }}>
          <p className="intro__eyebrow">A scrollytelling archive</p>
          <h1 className="intro__title">Walk with José</h1>
          <p className="intro__text">
            Scroll to follow Rizal from childhood to adulthood as he meets his
            family along the path.
          </p>
          <p className="intro__hint">Scroll ↓</p>
        </div>

        {/* Summary section: appears after the walking section ends */}
        {showSummary && (
          <section className="summary-section" style={{
            padding: '2rem 1.5rem',
            maxWidth: '800px',
            margin: '0 auto',
            textAlign: 'center',
            color: '#2b2118'
          }}>
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.8rem', color: '#8a5a2b' }}>
              Family Summary
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginTop: '1rem'
            }}>
              {family.map((member) => (
                <div
                  key={member.id}
                  style={{
                    padding: '1rem',
                    background: 'rgba(255,252,245,0.8)',
                    borderRadius: '8px',
                    border: '1px solid #e8dcc8',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <h3 style={{ margin: '0 0 0.5rem', color: '#8a5a2b', fontSize: '1.1rem' }}>
                    {member.name}
                  </h3>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#5c4a37' }}>
                    {member.role}
                  </p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.75rem', color: '#7a5a41', lineHeight: 1.4 }}>
                    {member.bioSummary}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <nav className="summary-nav">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setShowSummary(true)
            }}
            style={{
              position: 'fixed',
              bottom: '2rem',
              left: '1.5rem',
              padding: '0.5rem 1rem',
              background: 'rgba(255,252,245,0.8)',
              border: '1px solid #8a5a2b',
              borderRadius: '8px',
              color: '#2b2118',
              textDecoration: 'none',
              fontFamily: 'Georgia, serif',
              fontSize: '0.8rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase'
            }}
          >
            View Family Summary
          </a>
        </nav>

        <div className="intro" style={{ opacity: introOpacity }}>
          <p className="intro__eyebrow">A scrollytelling archive</p>
          <h1 className="intro__title">Walk with José</h1>
          <p className="intro__text">
            Scroll to follow Rizal from childhood to adulthood as he meets his
            family along the path.
          </p>
          <p className="intro__hint">Scroll ↓</p>
        </div>
      </main>
    </div>
  )
}