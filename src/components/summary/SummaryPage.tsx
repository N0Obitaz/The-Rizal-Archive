import React, { useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Figure } from '../RizalScene'
import * as THREE from 'three'

const familyMembers = [
  { id: 'jose', name: 'José Rizal', role: 'Hero', color: '#8d6e63' },
  { id: 'francisco', name: 'Francisco Mercado Rizal II', role: 'Father', color: '#5d4037' },
  { id: 'teodora', name: 'Teodora Alonso Realonda', role: 'Mother', color: '#5d4037' },
  { id: 'saturnina', name: 'Saturnina Rizal', role: 'Eldest sister', color: '#5d4037' },
  { id: 'paciano', name: 'Paciano Rizal', role: 'Older brother', color: '#5d4037' },
  { id: 'narcisa', name: 'Narcisa Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'olympia', name: 'Olimpia Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'lucia', name: 'Lucia Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'maria', name: 'Maria Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'concepcion', name: 'Concepcion Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'josefa', name: 'Josefa Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'trinidad', name: 'Trinidad Rizal', role: 'Sister', color: '#5d4037' },
  { id: 'soledad', name: 'Soledad Rizal', role: 'Youngest sister', color: '#5d4037' },
]

interface MemberInfo {
  id: string
  name: string
  role: string
  birthYear: number
  deathYear: number
  dateOfBirth: string
  dateOfDeath: string
  bioSummary: string
}

const memberData: Record<string, MemberInfo> = {
  jose: {
    id: 'jose',
    name: 'José Rizal',
    role: 'Hero',
    birthYear: 1861,
    deathYear: 1896,
    dateOfBirth: 'June 19, 1861',
    dateOfDeath: 'December 30, 1896',
    bioSummary: 'National hero of the Philippines. Wrote Noli Me Tangere and El Filibusterismo. Executed by firing squad at Bagumbayan.'
  },
  francisco: {
    id: 'francisco',
    name: 'Francisco Mercado Rizal II',
    role: 'Father',
    birthYear: 1818,
    deathYear: 1898,
    dateOfBirth: 'May 11, 1818',
    dateOfDeath: 'January 5, 1898',
    bioSummary: 'An independent-minded, serious, and taciturn gentleman. Raised by his mother after his father died when he was eight. He met and married Teodora Alonso in 1848.'
  },
  teodora: {
    id: 'teodora',
    name: 'Teodora Alonso Realonda',
    role: 'Mother',
    birthYear: 1827,
    deathYear: 1911,
    dateOfBirth: 'November 9, 1827',
    dateOfDeath: 'August 16, 1911',
    bioSummary: 'Educated, disciplined, and loving. She came from a well-educated family and was Rizal\'s first teacher, encouraging his talents and teaching him values through stories.'
  },
  saturnina: {
    id: 'saturnina',
    name: 'Saturnina Rizal',
    role: 'Eldest sister',
    birthYear: 1850,
    deathYear: 1913,
    dateOfBirth: 'June 4, 1850',
    dateOfDeath: 'September 14, 1913',
    bioSummary: 'The eldest child, nicknamed Neneng. Responsible and caring, she helped take care of the younger children and later supported Rizal\'s literary works.'
  },
  paciano: {
    id: 'paciano',
    name: 'Paciano Rizal',
    role: 'Older brother',
    birthYear: 1851,
    deathYear: 1930,
    dateOfBirth: 'March 9, 1851',
    dateOfDeath: 'April 13, 1930',
    bioSummary: 'Radical, steadfast, and deeply patriotic — a revolutionary through and through. Quiet and preferred to operate underground. He studied under Father José Burgos.'
  },
  narcisa: {
    id: 'narcisa',
    name: 'Narcisa Rizal',
    role: 'Sister',
    birthYear: 1852,
    deathYear: 1939,
    dateOfBirth: 'October 29, 1852',
    dateOfDeath: 'June 24, 1939',
    bioSummary: 'Loving, courageous, and resourceful. She devotedly supported her brother José and preserved his memory. She attempted to maintain contact with him during his imprisonment.'
  },
  olympia: {
    id: 'olympia',
    name: 'Olimpia Rizal',
    role: 'Sister',
    birthYear: 1854,
    deathYear: 1887,
    dateOfBirth: 'December 1854',
    dateOfDeath: 'September 22, 1887',
    bioSummary: 'Nicknamed Ypia, she was José\'s \"stout sister\" whom he affectionately teased. José confided in her about his first love, Segunda Katigbak.'
  },
  lucia: {
    id: 'lucia',
    name: 'Lucia Rizal',
    role: 'Sister',
    birthYear: 1856,
    deathYear: 1919,
    dateOfBirth: 'December 13, 1856',
    dateOfDeath: 'December 25, 1919',
    bioSummary: 'Devoted and resilient. In 1889, her husband Mariano Herbosa died during a cholera epidemic and was denied a Christian burial due to his connection to José.'
  },
  maria: {
    id: 'maria',
    name: 'Maria Rizal',
    role: 'Sister',
    birthYear: 1859,
    deathYear: 1945,
    dateOfBirth: 'June 1859',
    dateOfDeath: 'September 1, 1945',
    bioSummary: 'Nicknamed Biang, she was one of José\'s closest and most trusted sisters. A resilient woman and frequent letter recipient, she was a supportive confidante throughout his studies.'
  },
  conception: {
    id: 'concepcion',
    name: 'Concepcion Rizal',
    role: 'Sister',
    birthYear: 1862,
    deathYear: 1865,
    dateOfBirth: 'April 19, 1862',
    dateOfDeath: 'August 16, 1865',
    bioSummary: 'Affectionately called Concha, she was only about three years old when she died. José remembered her death vividly — it was the first time he cried because of love and sorrow.'
  },
  josefa: {
    id: 'josefa',
    name: 'Josefa Rizal',
    role: 'Sister',
    birthYear: 1865,
    deathYear: 1945,
    dateOfBirth: 'March 19, 1865',
    dateOfDeath: 'December 10, 1945',
    bioSummary: 'Nicknamed Panggoy and later Sumikat, she broke stereotypes as one of the first 29 female members of the Katipunan and stood as President of its women\'s branch.'
  },
  trinidad: {
    id: 'trinidad',
    name: 'Trinidad Rizal',
    role: 'Sister',
    birthYear: 1868,
    deathYear: 1951,
    dateOfBirth: 'June 6, 1868',
    dateOfDeath: 'May 9, 1951',
    bioSummary: 'Courageous, compassionate, and patriotic. She joined the Katipunan and helped care for wounded revolutionaries. Their most significant interaction was shortly before José\'s execution.'
  },
  soledad: {
    id: 'soledad',
    name: 'Soledad Rizal',
    role: 'Youngest sister',
    birthYear: 1870,
    deathYear: 1929,
    dateOfBirth: 'June 7, 1870',
    dateOfDeath: 'August 26, 1929',
    bioSummary: 'The youngest sibling, called Choleng. Among the best-educated of Rizal\'s sisters, she pursued teaching — a profession José deeply admired.'
  },
}

interface SummaryPageProps {
  family: typeof familyMembers
}

export function SummaryPage({ family }: SummaryPageProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const mousePos = useRef({ x: 0, y: 0 })

  const handlePointerOver = (id: string) => {
    setHoveredId(id)
  }

  const handlePointerOut = () => {
    setHoveredId(null)
  }

  // Calculate positions in a circle
  const memberCount = family.length
  const radius = 3
  const angleStep = (Math.PI * 2) / memberCount

  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      style={{
        width: '100%',
        height: '100%',
        background: '#f2e6d0',
        pointerEvents: 'auto',
      }}
      onPointerMove={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        mousePos.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }
      }}
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />

      <group>
        {family.map((member, i) => {
          const info = memberData[member.id] || { name: member.name, role: member.role, bioSummary: '' }
          const angle = (i * angleStep) + Math.PI / 2
          const x = radius * Math.cos(angle)
          const z = radius * Math.sin(angle)

          const isHovered = hoveredId === member.id

          return (
            <Figure
              key={member.id}
              progressRef={useRef(0)}
              color={member.color}
              lateralOffset={0}
              lateralOffsetRef={undefined}
              baseScale={1.2}
              opacityRef={isHovered ? useRef(1) : useRef(0.6)}
            >
              <group>
                {/* Simple positioning - the Figure component walks the path,
                    but with progressRef=0 it stands still. We manually position
                    it using the group transform. */}
                <group
                  position={[x, 0, z]}
                  onPointerOver={() => handlePointerOver(member.id)}
                  onPointerOut={handlePointerOut}
                >
                  {/* The Figure component renders a capsule-based figure;
                      we'll just show the name below it in the UI. */}
                </group>
              </group>
            </Figure>
          )
        })}

        {/* Tooltip display */}
        {hoveredId && (
          <div
            style={{
              position: 'fixed',
              top: mousePos.current.y + 20,
              left: mousePos.current.x + 20,
              background: 'rgba(43, 33, 24, 0.9)',
              color: '#f2e6d0',
              padding: '1rem 1.5rem',
              borderRadius: '8px',
              fontFamily: 'Georgia, serif',
              fontSize: '0.85rem',
              width: '200px',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ margin: '0 0 0.5rem', color: '#fff' }}>{hoveredId === 'jose' ? 'José Rizal' : memberData[hoveredId]?.name || ''}</h3>
            <p style={{ margin: '0.25rem 0', lineHeight: 1.4, color: '#d7ccc8' }}>
              {memberData[hoveredId]?.bioSummary || ''}
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', opacity: 0.8 }}>
              {memberData[hoveredId]?.role || ''}
            </p>
          </div>
        )}
      </group>
    </Canvas>
  )
}