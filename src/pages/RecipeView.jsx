import { useState } from 'react'
import { formatQuantity } from '../lib/quantity.js'
import { addDays, formatCycle, formatDay, today } from '../lib/plan.js'
import { formatRating, recipeRatings } from '../lib/ratings.js'
import { activeIngredients, categoryOf, formatMinutes, recipeIssues, scaleQuantity, totalMinutes } from '../lib/recipe.js'
import { EFFORT_LABELS } from '../lib/settings.js'

const SCALES = [0.5, 1, 1.5, 2, 3]

/** The recipe for reading and cooking from; editing is one click away. */
export default function RecipeView({ recipe, plan, actions }) {
  const [scale, setScale] = useState(1)
  // Ingredients ticked off while prepping. Not saved; it's for this cook only.
  const [ticked, setTicked] = useState(() => new Set())

  if (!recipe)
    return (
      <p className="muted">
        Recipe not found. <a href="#/">Back to recipes</a>
      </p>
    )

  const ingredients = activeIngredients(recipe)
  const groups = [...new Set(ingredients.map((i) => i.group ?? ''))]
  const steps = recipe.steps.filter((s) => s.trim())
  const issues = recipeIssues(recipe)
  const minutes = totalMinutes(recipe)
  const category = categoryOf(recipe)
  const now = today()
  const upcoming = plan.meals.filter((m) => m.recipeId === recipe.id && (m.date ? m.date >= now : m.cycle >= addDays(now, -13)))
  const rating = recipeRatings(plan, recipe.id)
  const toggle = (id) =>
    setTicked((t) => {
      const next = new Set(t)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <article className="recipe-view">
      <a href={category === 'main' ? '#/' : `#/?cat=${category}`} className="small back-link">
        ← Recipes
      </a>
      <div className="recipe-head">
        <h1>{recipe.name}</h1>
        <div className="head-actions">
          <button onClick={(e) => e.detail <= 1 && actions.addToPlan(recipe.id, scale)}>+ Add to plan</button>
          <a className="button primary" href={`#/recipe/${recipe.id}/edit`}>
            Edit
          </a>
        </div>
      </div>

      <div className="view-meta muted small">
        {recipe.source && (
          <a href={recipe.source} target="_blank" rel="noreferrer">
            Original recipe ↗
          </a>
        )}
        {recipe.effort && (
          <span>
            Effort {recipe.effort}/5 ({EFFORT_LABELS[recipe.effort]})
          </span>
        )}
        {minutes != null && (
          <span>
            {formatMinutes(minutes)}
            {recipe.prepMinutes != null && recipe.cookMinutes != null && ` (${recipe.prepMinutes} prep + ${recipe.cookMinutes} cook)`}
          </span>
        )}
        {(recipe.tags ?? []).length > 0 && <span>{recipe.tags.join(' · ')}</span>}
        {rating.times > 0 && (
          <a href="#ratings">
            ★ {formatRating(rating.average)} ({Object.entries(rating.byPerson).map(([p, n]) => `${p} ${formatRating(n)}`).join(', ')})
          </a>
        )}
        {upcoming.length > 0 && (
          <a href={`#/plan/${upcoming[0].cycle}`}>
            Planned: {upcoming.map((m) => (m.date ? formatDay(m.date) : `${formatCycle(m.cycle)}, not on a day`)).join('; ')}
          </a>
        )}
      </div>

      {issues.length > 0 && (
        <p className="notice small">
          This recipe has {issues.join(', ')}. <a href={`#/recipe/${recipe.id}/edit`}>Edit it</a> to fill that in.
        </p>
      )}

      {recipe.notes?.trim() && (
        <aside className="notes-callout">
          <h2>Your notes</h2>
          <p>{recipe.notes}</p>
        </aside>
      )}

      <div className="view-columns">
        <section className="view-ingredients">
          <div className="section-head">
            <h2>Ingredients</h2>
            <label className="small scale-picker">
              Make
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    ×{formatQuantity(s)}
                    {recipe.servings ? ` (${formatQuantity(recipe.servings * s)} servings)` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ingredients.length === 0 && <p className="muted small">No ingredients yet.</p>}
          {groups.map((group) => (
            <div key={group}>
              {group && <h3 className="group-label">{group}</h3>}
              <ul className="check-list">
                {ingredients
                  .filter((i) => (i.group ?? '') === group)
                  .map((i) => (
                    <li key={i.id} className={ticked.has(i.id) ? 'done' : ''}>
                      <label>
                        <input type="checkbox" checked={ticked.has(i.id)} onChange={() => toggle(i.id)} />
                        <span>
                          <strong>{[scaleQuantity(i.quantity, scale), i.unit].filter((s) => s && String(s).trim()).join(' ')}</strong>{' '}
                          {i.item}
                          {i.note && <span className="muted">, {i.note}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="view-steps">
          <h2>Steps</h2>
          {steps.length === 0 ? (
            <p className="muted small">
              No steps yet. <a href={`#/recipe/${recipe.id}/edit`}>Add some</a>.
            </p>
          ) : (
            <ol className="read-steps">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {scale !== 1 && <p className="muted small">Amounts in the steps are as written, not scaled.</p>}
        </section>
      </div>

      {rating.times > 0 && (
        <section id="ratings" className="rating-history">
          <h2>Ratings</h2>
          <ul>
            {rating.history.map((h) => (
              <li key={h.id}>
                <span className="muted small">{h.date ? formatDay(h.date) : 'Undated'}</span>{' '}
                {Object.entries(h.ratings)
                  .map(([p, n]) => `${p} ${n}/5`)
                  .join(' · ')}
                {h.note && <span className="muted"> — {h.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
