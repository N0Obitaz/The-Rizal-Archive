import type { FamilyMember } from '../types'

interface WaypointProps {
  member: FamilyMember
  /** Used to alternate the panel left/right. */
  index: number
  /** True while this is the current waypoint (see getActiveWaypointIndex). */
  isActive: boolean
}

/**
 * One family member's stop on the path: just the bio panel. The walking
 * companion is rendered inside the 3D scene (RizalScene), so the panel and
 * the figure never duplicate each other, and no text lives in the canvas.
 *
 * This is a plain HTML overlay: it sits above the fixed <canvas> and fades
 * using the `isActive` prop, which App derives from the ScrollTrigger-backed
 * page progress (the same 0–1 value and ranges as before the 3D conversion).
 */
export function Waypoint({ member, index, isActive }: WaypointProps) {
  const side = index % 2 === 0 ? 'left' : 'right'

  return (
    <section
      id={member.id}
      className={`waypoint waypoint--${side}${isActive ? ' is-active' : ''}`}
      aria-label={`${member.name}, ${member.role}`}
    >
      <article className="waypoint__panel">
        <p className="waypoint__role">{member.role}</p>
        <h2 className="waypoint__name">{member.name}</h2>
        <p className="waypoint__meta">
          {member.birthYear}–{member.deathYear}
          <span className="waypoint__age">
            {' '}
            · Rizal was about {member.rizalAgeAtEncounter}
          </span>
        </p>
        <p className="waypoint__bio">{member.bioSummary}</p>

        {member.sources.length > 0 && (
          <ul className="waypoint__sources">
            {member.sources.map((source) => (
              <li key={source}>
                <a href={source} target="_blank" rel="noreferrer">
                  Source
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}
