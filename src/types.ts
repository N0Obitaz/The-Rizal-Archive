/**
 * A single member of the Rizal family featured as a waypoint on the path.
 */
export interface FamilyMember {
  /** Stable slug used as React key and anchor id. */
  id: string
  /** Full display name. */
  name: string
  /** One-line label, e.g. "Father" or "Eldest sister". */
  role: string
  /** Year of birth. */
  birthYear: number
  /** Year of death. */
  deathYear: number
  /**
   * José Rizal's age when he is narrated as encountering this person.
   * This is what positions the waypoint along the path: the family's
   * min/max ages are mapped onto 0–1 scroll progress.
   */
  rizalAgeAtEncounter: number
  /** Short 2–3 sentence bio shown in the panel. */
  bioSummary: string
  /** Source URLs backing the bio. */
  sources: string[]
}
