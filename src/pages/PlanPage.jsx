import { useEffect, useRef, useState } from 'react'
import { formatQuantity } from '../lib/quantity.js'
import { addDays, entriesForWeek, formatDay, formatWeek, today, weekDates, weekStart } from '../lib/plan.js'

export default function PlanPage({ plan, week, recipes, recipesById, actions }) {
  const [recipeText, setRecipeText] = useState('')
  const [date, setDate] = useState('')
  const recipeInput = useRef(null)
  const days = weekDates(week)
  const now = today()
  const shown = entriesForWeek(plan, week)
  const byName = new Map(recipes.map((r) => [r.name.toLowerCase(), r]))
  const picked = byName.get(recipeText.trim().toLowerCase())

  // Keep the chosen day inside the week being shown.
  useEffect(() => setDate((d) => (d && days.includes(d) ? d : '')), [week])

  function add(e) {
    e.preventDefault()
    if (!picked) return
    actions.addToPlan(picked.id, date || null)
    // Back to Unscheduled, so the next meal isn't quietly put on the same day.
    setDate('')
    setRecipeText('')
    recipeInput.current?.focus()
  }

  const dayOptions = [
    ...days.map((d) => (
      <option key={d} value={d}>
        {formatDay(d)}
      </option>
    )),
    <option key="" value="">
      Unscheduled
    </option>,
  ]

  const section = (key, heading, entries, dayDate) => (
    <div key={key} className={`day ${dayDate && dayDate < now ? 'past' : ''}`}>
      <h3>
        {heading}
        {dayDate === now && <span className="pill">today</span>}
      </h3>
      {entries.length === 0 ? (
        <p className="empty-day muted small">
          Nothing planned.{' '}
          <button
            className="link small"
            onClick={() => {
              setDate(dayDate ?? '')
              recipeInput.current?.focus()
            }}
          >
            + Add a meal
          </button>
        </p>
      ) : (
        entries.map((entry) => <PlanRow key={entry.id} entry={entry} recipe={recipesById[entry.recipeId]} dayOptions={dayOptions} actions={actions} />)
      )}
    </div>
  )

  return (
    <section>
      <div className="week-nav">
        <a className="button" href={`#/plan/${addDays(week, -7)}`} aria-label="Previous week">
          ‹
        </a>
        <h2>Week of {formatWeek(week)}</h2>
        <a className="button" href={`#/plan/${addDays(week, 7)}`} aria-label="Next week">
          ›
        </a>
        {week !== weekStart() && (
          <a className="small" href={`#/plan/${weekStart()}`}>
            This week
          </a>
        )}
        <span className="spacer" />
        <a className="button primary" href={`#/grocery/${week}`}>
          Grocery list for this week →
        </a>
      </div>

      <form className="toolbar" onSubmit={add}>
        <datalist id="recipe-names">
          {recipes.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
        <input
          ref={recipeInput}
          type="search"
          list="recipe-names"
          placeholder="Search recipes to add…"
          aria-label="Recipe to add"
          value={recipeText}
          onChange={(e) => setRecipeText(e.target.value)}
        />
        <select value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day">
          {dayOptions}
        </select>
        <button className="primary" disabled={!picked}>
          Add meal
        </button>
      </form>
      <p className="muted small">
        Changes save automatically. Unscheduled meals show every week and count toward each week's grocery list.
        {shown.length > 0 && (
          <>
            {' '}
            <button className="link small" onClick={() => actions.clearEntries(shown)}>
              Clear this week ({shown.length})
            </button>
          </>
        )}
      </p>

      {days.map((d) => section(d, formatDay(d), shown.filter((e) => e.date === d), d))}
      {section('unscheduled', 'Unscheduled', shown.filter((e) => !e.date), null)}
    </section>
  )
}

function PlanRow({ entry, recipe, dayOptions, actions }) {
  // The scale is edited as text and saved only when it's a positive number,
  // so clearing the box to type a new value doesn't save a blank.
  const [scaleText, setScaleText] = useState(String(entry.scale))
  useEffect(() => setScaleText(String(entry.scale)), [entry.scale])
  const commitScale = () => {
    const n = Number(scaleText)
    if (n > 0) n !== entry.scale && actions.updateEntry(entry.id, { scale: n })
    else setScaleText(String(entry.scale))
  }
  const scale = Number(scaleText) > 0 ? Number(scaleText) : entry.scale

  return (
    <div className="plan-row">
      {recipe ? <a href={`#/recipe/${recipe.id}`}>{recipe.name}</a> : <span className="muted">Missing recipe: {entry.recipeId}</span>}
      <label className="small">
        Scale ×
        <input
          type="number"
          min="0.25"
          step="0.25"
          value={scaleText}
          onChange={(e) => setScaleText(e.target.value)}
          onBlur={commitScale}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      <span className="muted small servings">{recipe?.servings ? `${formatQuantity(recipe.servings * scale)} servings` : 'servings not set'}</span>
      <select value={entry.date ?? ''} onChange={(e) => actions.updateEntry(entry.id, { date: e.target.value || null })} aria-label={`Day for ${recipe?.name ?? 'meal'}`}>
        {entry.date && !dayOptions.some((o) => o.key === entry.date) && <option value={entry.date}>{formatDay(entry.date)}</option>}
        {dayOptions}
      </select>
      <button onClick={() => actions.removeEntry(entry)}>Remove</button>
    </div>
  )
}
