import { useState } from 'react'
import type { FamilyMember } from '../types'

import franciscoImg from '../assets/Francisco_r_mercado.jpg'
import teodoraImg from '../assets/Teodora_alonzo.jpg'
import saturninaImg from '../assets/Saturnina_mercado.jpg'
import pacianoImg from '../assets/paciano rizal.jpg'
import narcisaImg from '../assets/Doña_Narcisa_Rizal-_Jose_Rizal_s_sister.jpeg'
import olympiaImg from '../assets/Olimpia_mercado.jpg'
import luciaImg from '../assets/Lucia_mercado.jpg'
import mariaImg from '../assets/maria rizal.jpg'
import josefaImg from '../assets/josefa rizal.jpg'
import trinidadImg from '../assets/trinidad rizal.jpg'
import soledadImg from '../assets/soledad rizal.jpg'

const IMAGES: Record<string, string> = {
  francisco: franciscoImg,
  teodora: teodoraImg,
  saturnina: saturninaImg,
  paciano: pacianoImg,
  narcisa: narcisaImg,
  olympia: olympiaImg,
  lucia: luciaImg,
  maria: mariaImg,
  josefa: josefaImg,
  trinidad: trinidadImg,
  soledad: soledadImg,
}

interface FamilyTreeProps {
  family: FamilyMember[]
  onBack: () => void
}

export function FamilyTree({ family, onBack }: FamilyTreeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const father = family.find((m) => m.id === 'francisco')!
  const mother = family.find((m) => m.id === 'teodora')!
  const children = family.filter((m) => m.id !== 'francisco' && m.id !== 'teodora')

  const hovered = hoveredId ? family.find((m) => m.id === hoveredId) ?? null : null
  const hoveredImg = hoveredId ? IMAGES[hoveredId] : undefined

  return (
    <div className="ft">
      <header className="ft__header">
        <button className="ft__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="ft__title">The Rizal Family Tree</h1>
        <p className="ft__subtitle">Hover over a portrait to learn more</p>
      </header>

      <div className="ft__tree">
        {/* Parents row */}
        <div className="ft__parents">
          <FamilyCard
            member={father}
            image={IMAGES[father.id]}
            isHovered={hoveredId === father.id}
            onHover={setHoveredId}
          />
          <span className="ft__and">&amp;</span>
          <FamilyCard
            member={mother}
            image={IMAGES[mother.id]}
            isHovered={hoveredId === mother.id}
            onHover={setHoveredId}
          />
        </div>

        {/* Connector line from parents to children */}
        <div className="ft__connector">
          <div className="ft__connector-line" />
        </div>

        {/* Children row */}
        <div className="ft__children">
          {children.map((child) => (
            <FamilyCard
              key={child.id}
              member={child}
              image={IMAGES[child.id]}
              isHovered={hoveredId === child.id}
              onHover={setHoveredId}
            />
          ))}
        </div>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="ft__tooltip" role="tooltip">
          {hoveredImg && (
            <img
              className="ft__tooltip-img"
              src={hoveredImg}
              alt={hovered.name}
            />
          )}
          <div className="ft__tooltip-body">
            <p className="ft__tooltip-role">{hovered.role}</p>
            <h3 className="ft__tooltip-name">{hovered.name}</h3>
            <p className="ft__tooltip-dates">
              {hovered.dateOfBirth} — {hovered.dateOfDeath}
            </p>
            <p className="ft__tooltip-bio">{hovered.bioSummary}</p>
            {hovered.occupation && (
              <p className="ft__tooltip-detail">
                <strong>Occupation:</strong> {hovered.occupation}
              </p>
            )}
            {hovered.education && (
              <p className="ft__tooltip-detail">
                <strong>Education:</strong> {hovered.education}
              </p>
            )}
            {hovered.causeOfDeath && (
              <p className="ft__tooltip-detail">
                <strong>Died:</strong> {hovered.causeOfDeath}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual family card (portrait + name label)
// ---------------------------------------------------------------------------
function FamilyCard({
  member,
  image,
  isHovered,
  onHover,
}: {
  member: FamilyMember
  image: string | undefined
  isHovered: boolean
  onHover: (id: string | null) => void
}) {
  return (
    <div
      className={`ft__card${isHovered ? ' ft__card--active' : ''}`}
      onMouseEnter={() => onHover(member.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(member.id)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${member.name}, ${member.role}`}
    >
      <div className="ft__portrait">
        {image ? (
          <img
            className="ft__portrait-img"
            src={image}
            alt={member.name}
            loading="lazy"
          />
        ) : (
          <div className="ft__portrait-fallback">
            {member.name.charAt(0)}
          </div>
        )}
      </div>
      <p className="ft__card-name">{member.name.split(' ')[0]}</p>
      <p className="ft__card-role">{member.role}</p>
    </div>
  )
}
