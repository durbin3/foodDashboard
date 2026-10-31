// Keeps the shared Google Calendar in step with the plan. Saving the plan asks
// for a sync, as do starting the server and setting the calendar ID; there's
// no timer. Requests within a short moment are combined, and only one sync
// runs at a time (a request during one runs again after it). A failed sync
// waits for the next plan save.
//
// Needs `calendarId` in data/settings.json and a service account key at
// secrets/google-service-account.json, with the calendar shared to that
// account ("Make changes to events"). Without either, syncing is off.
import fs from 'node:fs/promises'
import path from 'node:path'
import { APP_TAG, calendarEvents, diffEvents, googleEvent } from '../src/lib/calendar.js'
import { addDays, CYCLE_DAYS, cycleStart, normalizePlan } from '../src/lib/plan.js'
import { normalizeSettings } from '../src/lib/settings.js'
import { createClient } from './googleCalendar.js'
import { listRecipes, readJson, readRegistry, ROOT } from './ingredientStore.js'

export const KEY_FILE = path.join(ROOT, 'secrets', 'google-service-account.json')
const DEBOUNCE_MS = 1500

// { state: 'off' | 'syncing' | 'ok' | 'error', reason?, error?, at?, email?, changes? }
let status = { state: 'off', reason: 'not-started' }
let timer = null
let running = null
let again = false
let client = null
let clientKey = null

export const calendarStatus = () => status

export function requestSync() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (running) again = true
    else running = runSync().finally(() => {
      running = null
      if (again) {
        again = false
        requestSync()
      }
    })
  }, DEBOUNCE_MS)
}

async function loadClient() {
  let raw
  try {
    raw = await fs.readFile(KEY_FILE, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
  if (raw !== clientKey) {
    client = createClient(JSON.parse(raw))
    clientKey = raw
  }
  return client
}

async function runSync() {
  try {
    const settings = normalizeSettings(await readJson(path.join(ROOT, 'data', 'settings.json'), {}))
    const calendarId = settings.calendarId?.trim()
    if (!calendarId) return (status = { state: 'off', reason: 'no-calendar' })
    const google = await loadClient()
    if (!google) return (status = { state: 'off', reason: 'no-key' })
    status = { ...status, state: 'syncing', email: google.email }

    const [rawPlan, recipes, registry] = await Promise.all([readJson(path.join(ROOT, 'data', 'plan.json'), { meals: [] }), listRecipes(), readRegistry()])
    const plan = normalizePlan(rawPlan, settings.cycleStart)
    const recipesById = Object.fromEntries(recipes.map((r) => [r.id, r]))
    // The last cycle and everything after it; older events are left as they were.
    const from = addDays(cycleStart(settings.cycleStart), -CYCLE_DAYS)
    const wanted = calendarEvents({ plan, recipesById, registry, settings, from })
    const existing = (await google.listEvents(calendarId, { privateProperty: `app=${APP_TAG}`, timeMin: `${from}T00:00:00Z` })).filter(
      (g) => g.start?.date >= from,
    )
    const { insert, update, remove } = diffEvents(wanted, existing)
    for (const e of insert) await google.insertEvent(calendarId, googleEvent(e))
    for (const { id, event } of update) await google.patchEvent(calendarId, id, googleEvent(event))
    for (const id of remove) await google.deleteEvent(calendarId, id)

    status = { state: 'ok', at: new Date().toISOString(), email: google.email, changes: insert.length + update.length + remove.length }
  } catch (err) {
    console.error('[calendar sync]', err.message)
    status = { state: 'error', at: new Date().toISOString(), error: err.message, email: client?.email }
  }
}
