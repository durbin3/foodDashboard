import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { addDays, CYCLE_DAYS, cycleStart, formatDay, isISODate, weekStart } from '../lib/plan.js'
import { EFFORT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../lib/settings.js'

export default function SettingsPage({ settings, actions }) {
  const update = (patch) => actions.updateSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const current = cycleStart(settings.cycleStart)
  const shopping = addDays(current, -1)
  const nextShopping = addDays(current, CYCLE_DAYS - 1)

  return (
    <section className="settings">
      <h2>Shopping</h2>
      {/* Shopping is every other Sunday; the cycle is the two weeks from the Monday after. */}
      <div className="shopping-dates small">
        <label>
          Last trip
          <input
            type="date"
            value={shopping}
            onChange={(e) => isISODate(e.target.value) && update({ cycleStart: weekStart(addDays(e.target.value, 1)) })}
          />
        </label>
        <span>
          Next trip <strong>{formatDay(nextShopping)}</strong>
        </span>
      </div>

      <h2 title="Each day on the meal plan starts from these">Usual week</h2>
      <table className="day-settings">
        <thead>
          <tr>
            <th />
            <th>Cook</th>
            <th>Effort up to</th>
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((d) => {
            const noCook = settings.noCookDays.includes(d)
            return (
              <tr key={d} className={noCook ? 'muted' : ''}>
                <td>{WEEKDAY_LABELS[d]}</td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Cook on ${WEEKDAY_LABELS[d]}`}
                    checked={!noCook}
                    onChange={(e) => update((s) => ({ noCookDays: e.target.checked ? s.noCookDays.filter((x) => x !== d) : [...s.noCookDays, d] }))}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Effort on ${WEEKDAY_LABELS[d]}`}
                    value={settings.dayEffort[d]}
                    disabled={noCook}
                    onChange={(e) => update((s) => ({ dayEffort: { ...s.dayEffort, [d]: Number(e.target.value) } }))}
                  >
                    {Object.entries(EFFORT_LABELS).map(([n, label]) => (
                      <option key={n} value={n}>
                        {n}: {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2 title="Meals, leftovers and thaw reminders are copied to this Google Calendar">Shared calendar</h2>
      <CalendarSetting calendarId={settings.calendarId} onChange={(calendarId) => update({ calendarId })} />

      <h2 title="Everyone here rates meals; a recipe's rating is the average">People</h2>
      <PeopleEditor people={settings.people} onChange={(people) => update({ people })} />
    </section>
  )
}

function PeopleEditor({ people, onChange }) {
  const [draft, setDraft] = useState(people)
  useEffect(() => setDraft(people), [people.join('|')])
  const names = draft.map((p) => p.trim())
  const valid = names.every(Boolean) && new Set(names.map((n) => n.toLowerCase())).size === names.length && names.length > 0
  const changed = names.join('|') !== people.join('|')
  return (
    <div className="people">
      {draft.map((p, i) => (
        <div key={i} className="inline-form">
          <input aria-label={`Person ${i + 1}`} value={p} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? e.target.value : x)))} />
          {draft.length > 1 && <button onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      <div className="inline-form">
        <button className="link" onClick={() => setDraft((d) => [...d, ''])}>
          + Add person
        </button>
        {changed && (
          <>
            <button className="primary" disabled={!valid} onClick={() => onChange(names)}>
              Save people
            </button>
            <button onClick={() => setDraft(people)}>Cancel</button>
            {!valid && <span className="field-warning">Names must be filled in and different.</span>}
          </>
        )}
      </div>
    </div>
  )
}

function CalendarSetting({ calendarId, onChange }) {
  const [draft, setDraft] = useState(calendarId)
  useEffect(() => setDraft(calendarId), [calendarId])
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let live = true
    const poll = () => api.getCalendarStatus().then((s) => live && setStatus(s), () => {})
    poll()
    const id = setInterval(poll, 3000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])
  const commit = () => draft.trim() !== calendarId && onChange(draft.trim())

  return (
    <div className="inline-form calendar-setting">
      <input
        aria-label="Calendar ID"
        placeholder="Calendar ID"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {calendarId && <CalendarStatus status={status} />}
    </div>
  )
}

function CalendarStatus({ status }) {
  if (!status) return null
  const time = status.at && new Date(status.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (status.state === 'syncing') return <span className="small muted">Syncing…</span>
  if (status.state === 'ok') return <span className="small muted" title={`Writing as ${status.email}`}>Synced {time}</span>
  if (status.state === 'error') return <span className="small field-warning" title={status.error}>Can't sync</span>
  if (status.reason === 'no-key') return <span className="small field-warning" title="Save the service account's JSON key as secrets/google-service-account.json">No key</span>
  return null
}
