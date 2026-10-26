// Household settings (data/settings.json): who rates meals, how the two-week
// shopping cycle lines up with the calendar, and how much effort each weekday
// can take. Shopping is every other Sunday; a cycle is the 14 days from the
// Monday after it.

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const WEEKDAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

export const EFFORT_LABELS = { 1: 'Dump and go', 2: 'Easy', 3: 'Some work', 4: 'Involved', 5: 'Project' }

export const DEFAULT_SETTINGS = {
  people: ['Eric', 'Sarah'],
  cycleStart: '2026-10-26',
  dayEffort: { mon: 3, tue: 3, wed: 3, thu: 3, fri: 3, sat: 4, sun: 4 },
  noCookDays: [],
  // How much each consideration counts. effort, freshness and variety steer
  // which day a meal is suggested for; cost, variety and recency steer which
  // meals are suggested.
  weights: { effort: 1, freshness: 1, variety: 1, cost: 1, recency: 1 },
}

/** Fill in anything missing from an older or hand-edited settings file. */
export function normalizeSettings(settings) {
  const s = settings ?? {}
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    dayEffort: { ...DEFAULT_SETTINGS.dayEffort, ...s.dayEffort },
    weights: { ...DEFAULT_SETTINGS.weights, ...s.weights },
    noCookDays: (s.noCookDays ?? []).filter((d) => WEEKDAYS.includes(d)),
  }
}
