import type { FamilyMember } from '../types'

interface WaypointProps {
  member: FamilyMember
  index: number
  isActive: boolean
}

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
          {member.dateOfBirth} — {member.dateOfDeath}
          <span className="waypoint__age">
            {' '}
            · Rizal was about {member.rizalAgeAtEncounter}
          </span>
        </p>
        <p className="waypoint__bio">{member.bioSummary}</p>

        {member.occupation && (
          <p className="waypoint__detail">
            <strong>Occupation:</strong> {member.occupation}
          </p>
        )}

        {member.education && (
          <p className="waypoint__detail">
            <strong>Education:</strong> {member.education}
          </p>
        )}

        {member.causeOfDeath && (
          <p className="waypoint__detail">
            <strong>Died:</strong> {member.causeOfDeath}
          </p>
        )}

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
