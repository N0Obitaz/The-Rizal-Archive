import type { FamilyMember } from '../types'

/** A normalized slice of the 0–1 scroll journey. */
export interface WaypointRange {
  start: number
  end: number
}

export interface AgeBounds {
  min: number
  max: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Lowest and highest `rizalAgeAtEncounter` across the family. */
export function getAgeBounds(members: FamilyMember[]): AgeBounds {
  const ages = members.map((m) => m.rizalAgeAtEncounter)
  return { min: Math.min(...ages), max: Math.max(...ages) }
}

/**
 * Map a member's encounter age onto 0–1 across the whole family's age range.
 * The first member sits at 0, the last at 1.
 */
export function getWaypointPosition(member: FamilyMember, bounds: AgeBounds): number {
  if (bounds.max === bounds.min) return 0.5
  return (member.rizalAgeAtEncounter - bounds.min) / (bounds.max - bounds.min)
}

/**
 * Turn a center position into the fade-in window for a waypoint.
 * `halfWindow` controls how wide the active band is around the center.
 */
export function getWaypointRange(position: number, halfWindow = 0.06): WaypointRange {
  return {
    start: clamp01(position - halfWindow),
    end: clamp01(position + halfWindow),
  }
}

/** Convenience: build every waypoint's range in one pass. */
export function buildWaypointRanges(
  members: FamilyMember[],
  halfWindow = 0.06,
): Array<{ member: FamilyMember; range: WaypointRange }> {
  const bounds = getAgeBounds(members)
  return members.map((member) => {
    const position = getWaypointPosition(member, bounds)
    return { member, range: getWaypointRange(position, halfWindow) }
  })
}

function rangeCenter(range: WaypointRange): number {
  return (range.start + range.end) / 2
}

/**
 * The single waypoint that is "current" at a given progress value.
 *
 * Ranges overlap slightly, so we prefer whichever in-range waypoint's center
 * is nearest. If progress sits in a gap between ranges, we fall back to the
 * nearest center. Returns -1 only for an empty list.
 *
 * This is the one source of truth for both the bio panel fade and the walking
 * companion, so the two always agree.
 */
export function getActiveWaypointIndex(
  waypoints: Array<{ range: WaypointRange }>,
  progress: number,
): number {
  if (waypoints.length === 0) return -1

  let nearest = 0
  let nearestDistance = Infinity
  const inRange: number[] = []

  waypoints.forEach((waypoint, index) => {
    const distance = Math.abs(progress - rangeCenter(waypoint.range))
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = index
    }
    if (progress >= waypoint.range.start && progress <= waypoint.range.end) {
      inRange.push(index)
    }
  })

  if (inRange.length === 0) return nearest
  return inRange.reduce((best, index) =>
    Math.abs(progress - rangeCenter(waypoints[index].range)) <
    Math.abs(progress - rangeCenter(waypoints[best].range))
      ? index
      : best,
  )
}
