import { useState } from 'react'

export const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLabel = (d) => d || 'Unscheduled'

export default function PlanPage({ plan, recipes, recipesById, actions }) {
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? '')
  const [day, setDay] = useState('')

  const updateEntry = (id, patch) =>
    actions.savePlan({ ...plan, entries: plan.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
  const removeEntry = (id) => actions.savePlan({ ...plan, entries: plan.entries.filter((e) => e.id !== id) })

  return (
    <section>
      <div className="toolbar">
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)}>
          {DAYS.map((d) => (
            <option key={d} value={d}>
              {dayLabel(d)}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!recipeId} onClick={() => actions.addToPlan(recipeId, day)}>
          Add meal
        </button>
        <span className="spacer" />
        {plan.entries.length > 0 && (
          <button onClick={() => confirm('Clear the whole plan?') && actions.savePlan({ ...plan, entries: [] })}>
            Clear plan
          </button>
        )}
      </div>

      {plan.entries.length === 0 && <p className="muted">No meals planned yet.</p>}

      {DAYS.map((d) => {
        const entries = plan.entries.filter((e) => (e.day ?? '') === d)
        if (!entries.length) return null
        return (
          <div key={d} className="day">
            <h3>{dayLabel(d)}</h3>
            {entries.map((entry) => {
              const recipe = recipesById[entry.recipeId]
              return (
                <div key={entry.id} className="plan-row">
                  {recipe ? (
                    <a href={`#/recipe/${recipe.id}`}>{recipe.name}</a>
                  ) : (
                    <span className="muted">Missing recipe: {entry.recipeId}</span>
                  )}
                  <label className="small">
                    Scale ×
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      value={entry.scale}
                      onChange={(e) => updateEntry(entry.id, { scale: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </label>
                  <select value={entry.day ?? ''} onChange={(e) => updateEntry(entry.id, { day: e.target.value })}>
                    {DAYS.map((x) => (
                      <option key={x} value={x}>
                        {dayLabel(x)}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removeEntry(entry.id)}>Remove</button>
                </div>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}
