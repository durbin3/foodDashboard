import { useEffect, useState } from 'react'
import { addDays, CYCLE_DAYS, cycleStart, formatDay, isISODate, weekStart } from '../lib/plan.js'
import { EFFORT_LABELS, WEEKDAY_LABELS, WEEKDAYS } from '../lib/settings.js'

export default function SettingsPage({ settings, actions }) {
  const update = (patch) => actions.updateSettings((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const current = cycleStart(settings.cycleStart)
  const shopping = addDays(current, -1)
  const nextShopping = addDays(current, CYCLE_DAYS - 1)

  return (
    <section className="settings">
      <h2>Shopping cycle</h2>
      <p className="small">
        You shop every other Sunday, and a cycle is the two weeks (Monday to Sunday) after each trip. This cycle runs{' '}
        <strong>
          {formatDay(current)} – {formatDay(addDays(current, CYCLE_DAYS - 1))}
        </strong>
        , after shopping on {formatDay(shopping)}. Next shopping trip: <strong>{formatDay(nextShopping)}</strong>.
      </p>
      <label className="small inline-form">
        A cycle starts on
        <input
          type="date"
          value={settings.cycleStart}
          onChange={(e) => isISODate(e.target.value) && update({ cycleStart: weekStart(e.target.value) })}
        />
        <span className="muted">Pick the Monday after any shopping trip. Other dates move to the Monday of their week.</span>
      </label>

      <h2>Effort by day</h2>
      <p className="muted small">The most effort you're up for on each day. Meal recommendations put harder meals on days that allow them.</p>
      <table className="day-settings">
        <thead>
          <tr>
            <th>Day</th>
            <th>Effort up to</th>
            <th>Cook?</th>
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((d) => {
            const noCook = settings.noCookDays.includes(d)
            return (
              <tr key={d} className={noCook ? 'muted' : ''}>
                <td>{WEEKDAY_LABELS[d]}</td>
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
                <td>
                  <label className="small">
                    <input
                      type="checkbox"
                      checked={!noCook}
                      onChange={(e) =>
                        update((s) => ({ noCookDays: e.target.checked ? s.noCookDays.filter((x) => x !== d) : [...s.noCookDays, d] }))
                      }
                    />{' '}
                    {noCook ? "We don't cook" : 'We cook'}
                  </label>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h2>People</h2>
      <p className="muted small">Everyone here rates the meals you've made. A recipe's rating is the average of everyone's.</p>
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
