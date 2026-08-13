import raw from './_seeddata.json'
import standardPositions from './standardPositions.json'
import { uid } from './util.js'

// Fixed list of Personalkosten positions read from the reference workbooks.
// This drives the capacity page independently of any Excel upload.
export const STANDARD_POSITIONS = standardPositions

// Default head-count: every position staffed with a standard 5 people per month.
export function defaultHeadcount(people = 5) {
  const hc = {}
  for (const p of STANDARD_POSITIONS) hc[p.position] = Array(12).fill(people)
  return hc
}

// Builds the initial demo state from real VW386 calculation data (HiSi + VoSi)
// plus a synthetic "planned" program to showcase the hatched rendering.
export function buildSeed() {
  const projects = [
    {
      id: uid('prj'),
      name: 'VW386 0EU · T-ROC NF',
      client: 'Volkswagen AG',
      color: '#1e40af',
      status: 'awarded', // alınmış / beauftragt
      collapsed: false,
      subProjects: [
        {
          id: uid('sub'),
          name: 'Hintersitz (HiSi)',
          source: 'P007069_D459304-P_Gesamtkalkulation_VW386_0EU_HiSi.xlsm',
          periods: raw.hisiPeriods,
          positions: raw.hisi,
          personalPositions: raw.hisiPersonal,
        },
        {
          id: uid('sub'),
          name: 'Vordersitz (VoSi)',
          source: 'P007069_D460079-Q_Gesamtkalkulation_VW386_0EU_VoSi.xlsm',
          periods: raw.vosiPeriods,
          positions: raw.vosi,
          personalPositions: raw.vosiPersonal,
        },
      ],
    },
    {
      id: uid('prj'),
      name: 'NextGen Seat Platform',
      client: 'OEM · Angebotsphase',
      color: '#7c3aed',
      status: 'planned', // planlanan / noch nicht beauftragt
      collapsed: false,
      subProjects: [
        {
          id: uid('sub'),
          name: 'Komplettsitz (Vorentwicklung)',
          source: 'Angebot_NextGen_Seat.xlsx',
          periods: raw.plannedPeriods,
          positions: raw.planned,
          personalPositions: raw.plannedPersonal,
        },
      ],
    },
  ]

  // Standard: every Personalkosten position staffed with 5 people per month.
  const headcount = defaultHeadcount(5)
  const capacityPositions = STANDARD_POSITIONS.map((p) => ({ ...p }))

  return {
    projects,
    capacity: {},
    capacityPositions,
    headcount,
    settings: { hoursPerFTEPerYear: 1600 },
  }
}
