import { useEffect, useState } from 'react'
import { buildGroceryList, groceryListText } from '../lib/grocery.js'
import { addDays, CYCLE_DAYS, cycleStart, formatCycle, formatDay, mealsForCycle } from '../lib/plan.js'
import { cycleDays, cycleWarnings } from '../lib/schedule.js'

const LIST_AS = [
  ['grocery', 'Groceries'],
  ['pantry', 'Pantry staple'],
  ['none', "Don't list"],
]
const listAsPatch = {
  grocery: { staple: undefined, notListed: undefined },
  pantry: { staple: true, notListed: undefined },
  none: { staple: undefined, notListed: true },
}

/**
 * Ticks are kept in this browser only, per shopping cycle, as { ingredientId: amount }.
 * A tick counts only while the amount is unchanged, so adding a meal that
 * needs more of something un-ticks it.
 */
function useTicks(cycle) {
  const key = `grocery-ticks:${cycle}`
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? {}
    } catch {
      return {}
    }
  }
  const [ticks, setTicks] = useState(read)
  useEffect(() => setTicks(read()), [key])
  const save = (next) => {
    setTicks(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Storage unavailable (private window); ticks just won't survive a reload.
    }
  }
  return [ticks, save]
}

export default function GroceryPage({ plan, cycle, settings, recipesById, registry, actions }) {
  const anchor = settings.cycleStart
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [ticks, setTicks] = useTicks(cycle)
  const entries = mealsForCycle(plan, cycle).sort((a, b) => (a.date ?? '~').localeCompare(b.date ?? '~'))
  const list = buildGroceryList(entries, recipesById, registry)
  const isTicked = (l) => ticks[l.id] === l.amount
  const all = [...list.groceries, ...list.pantry]
  const tickedCount = all.filter(isTicked).length

  const toggle = (l) => {
    const { [l.id]: _, ...rest } = ticks
    setTicks(isTicked(l) ? rest : { ...rest, [l.id]: l.amount })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(groceryListText(list, isTicked))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      actions.notify("Couldn't copy to the clipboard.", { kind: 'error' })
    }
  }

  const weekNav = (
    <div className="week-nav">
      <a className="button" href={`#/grocery/${addDays(cycle, -CYCLE_DAYS)}`} aria-label="Previous shopping trip">
        ‹
      </a>
      <h2>Shopping on {formatDay(addDays(cycle, -1))}</h2>
      <a className="button" href={`#/grocery/${addDays(cycle, CYCLE_DAYS)}`} aria-label="Next shopping trip">
        ›
      </a>
      <span className="muted small">for {formatCycle(cycle)}</span>
      {cycle !== cycleStart(anchor) && (
        <a className="small" href={`#/grocery/${cycleStart(anchor)}`}>
          Current cycle
        </a>
      )}
    </div>
  )

  if (!entries.length)
    return (
      <section>
        {weekNav}
        <p className="muted">
          Nothing planned for these two weeks. <a href={`#/plan/${cycle}`}>Plan some meals</a> to build a grocery list.
        </p>
      </section>
    )

  const line = (l) => {
    const listAs = l.notListed ? 'none' : l.staple ? 'pantry' : 'grocery'
    return (
      <li key={l.id} className={isTicked(l) ? 'done' : ''}>
        <label className="g-check">
          <input type="checkbox" checked={isTicked(l)} onChange={() => toggle(l)} />
          <span className="g-name">{l.name}</span>
        </label>
        <span className={`g-amount ${l.staple ? 'muted' : ''}`}>{l.amount || <span className="muted">as needed</span>}</span>
        <span className="muted small g-sources">{l.sources.join(', ')}</span>
        {editing && (
          <span className="g-edit small">
            <select
              aria-label={`List ${l.name} as`}
              value={listAs}
              onChange={(e) => actions.updateIngredient(l.id, listAsPatch[e.target.value])}
              disabled={!registry.ingredients[l.id]}
            >
              {LIST_AS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <a href={`#/ingredients/${encodeURIComponent(l.id)}`}>{l.unconverted ? 'Add conversion' : 'Settings'}</a>
          </span>
        )}
      </li>
    )
  }

  const section = (title, lines, hint) => (
    <div className="grocery-section">
      <h3>
        {title} {hint && <span className="muted small">{hint}</span>}
      </h3>
      {lines.length === 0 ? <p className="muted small">Nothing here.</p> : <ul className={`grocery ${editing ? 'editing' : ''}`}>{lines.map(line)}</ul>}
    </div>
  )

  return (
    <section>
      {weekNav}
      <CycleNotes meals={entries} days={cycleDays(cycle, settings)} recipesById={recipesById} registry={registry} />
      <details className="small muted meals-included">
        <summary>
          From {entries.length} meal{entries.length === 1 ? '' : 's'}
        </summary>
        <ul>
          {entries.map((e) => (
            <li key={e.id}>
              {e.date ? formatDay(e.date) : 'Not on a day'}: {recipesById[e.recipeId]?.name ?? e.recipeId}
              {e.scale !== 1 && ` ×${e.scale}`}
              {e.sides?.length > 0 && ` with ${e.sides.map((s) => recipesById[s.recipeId]?.name ?? s.recipeId).join(', ')}`}
            </li>
          ))}
        </ul>
      </details>
      <div className="toolbar">
        <button className="primary" onClick={copy}>
          {copied ? 'Copied!' : tickedCount ? "Copy what's left" : 'Copy as text'}
        </button>
        <span className="muted small">
          {tickedCount} of {all.length} checked
        </span>
        {tickedCount > 0 && (
          <button className="link small" onClick={() => setTicks({})}>
            Uncheck all
          </button>
        )}
        <span className="spacer" />
        <button aria-pressed={editing} className={editing ? 'on' : ''} onClick={() => setEditing((x) => !x)}>
          {editing ? 'Done editing' : 'Edit list'}
        </button>
      </div>
      {section('Groceries', list.groceries)}
      {section('Pantry', list.pantry, '— check you have these')}
      {list.notListed.length > 0 && (
        <p className="muted small">
          Not listed: {list.notListed.map((l) => l.name).join(', ')}.{' '}
          {!editing && (
            <button className="link small" onClick={() => setEditing(true)}>
              Change
            </button>
          )}
        </p>
      )}
      {editing && list.notListed.length > 0 && section('Not listed', list.notListed)}
    </section>
  )
}

/** Thawing reminders and freshness problems for the cycle, so they're seen when shopping. */
function CycleNotes({ meals, days, recipesById, registry }) {
  const { byMeal, thaw } = cycleWarnings({ meals, days, recipesById, registry })
  const thawDays = Object.keys(thaw).sort()
  const stale = meals.filter((m) => byMeal[m.id])
  if (!thawDays.length && !stale.length) return null
  return (
    <div className="notice small cycle-notes">
      <strong>This cycle</strong>
      <ul>
        {thawDays.map((d) => (
          <li key={d}>
            ❄ {formatDay(d)}: {thaw[d].join('; ')}
          </li>
        ))}
        {stale.map((m) => (
          <li key={m.id}>
            ⚠ {recipesById[m.recipeId]?.name ?? m.recipeId}: {byMeal[m.id].join(' ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
