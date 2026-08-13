import raw from './_seeddata.json'
import { uid } from './util.js'

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

  // Demo: available head-count per position, entered month by month (Jan..Dez).
  // Keys must match real position names from the Personalkosten section.
  const M = (a) => a
  const headcount = {
    'Projektleiter/in': M([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    'Projektingenieur/in': M([1, 1, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1]),
    'Konstrukteur/in - Stückliste & D-FMEA': M([1, 2, 3, 3, 4, 4, 4, 3, 3, 2, 2, 1]),
    'Konstrukteur/in - HiSi: Schaum (Einsatz DLE, Kabelabgang)': M([
      0, 1, 2, 2, 3, 3, 3, 2, 2, 1, 1, 0,
    ]),
    'Messingenieur (K-KSA,H-P.,Klima,SHZ)_CU210': M([0, 0, 1, 1, 2, 2, 2, 1, 1, 1, 0, 0]),
    'Modulkonstrukteur/in': M([1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1]),
  }

  return { projects, capacity: {}, headcount, settings: { hoursPerFTEPerYear: 1600 } }
}
