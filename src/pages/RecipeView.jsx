import { useEffect, useMemo, useRef, useState } from 'react'
import { formatQuantity, normalizeUnit, parseQuantity } from '../lib/quantity.js'
import { addDays, formatCycle, formatDay, today } from '../lib/plan.js'
import { formatRating, recentMeal, recipeRatings } from '../lib/ratings.js'
import { mainsFor, pairedSides, realServings } from '../lib/meals.js'
import ServingsEditor from './ServingsEditor.jsx'
import { activeIngredients, categoryOf, effectiveIngredient, formatMinutes, recipeIssues, scaleQuantity, totalMinutes } from '../lib/recipe.js'
import { EFFORT_LABELS } from '../lib/settings.js'
import { convertQty, edgesFor, formatAmount, splitAmounts, stepIngredientsOf, stepLines, unitChoices } from '../lib/steps.js'
import { BUILTIN_CONVERSIONS, unitGraph } from '../lib/units.js'

const SCALES = [0.5, 1, 1.5, 2, 3]
const STANDARD_EDGES = unitGraph(BUILTIN_CONVERSIONS)

/** The recipe for reading and cooking from; editing is one click away. */
export default function RecipeView({ recipe, recipes, recipesById, plan, registry, people, actions }) {
  const [scale, setScale] = useState(1)
  // Units picked to show amounts in (the tablespoon's dirty, so teaspoons): per
  // ingredient, and per amount written in a step's text. Just for this cook.
  const [units, setUnits] = useState({})
  const [textUnits, setTextUnits] = useState({})
  const edgesById = useMemo(
    () => Object.fromEntries((recipe?.ingredients ?? []).map((ing) => [ing.id, edgesFor(effectiveIngredient(ing) ?? {}, registry)])),
    [recipe, registry],
  )
  const edgesOf = (ing) => edgesById[ing.id] ?? STANDARD_EDGES

  if (!recipe)
    return (
      <p className="muted">
        Recipe not found. <a href="#/">Back to recipes</a>
      </p>
    )

  const ingredients = activeIngredients(recipe)
  const groups = [...new Set(ingredients.map((i) => i.group ?? ''))]
  const allUses = stepIngredientsOf(recipe, ingredients, registry)
  const shownSteps = recipe.steps.map((text, i) => ({ text, uses: allUses[i] ?? [] })).filter((s) => s.text.trim())
  const steps = shownSteps.map((s) => s.text)
  const usesByStep = stepLines(
    shownSteps.map((s) => s.uses),
    ingredients,
    { scale, edgesOf },
  )
  const pickUnit = (id, unit) => setUnits((u) => ({ ...u, [id]: unit }))
  const issues = recipeIssues(recipe)
  const minutes = totalMinutes(recipe)
  const category = categoryOf(recipe)
  const now = today()
  const isSide = category === 'side'
  const usesThis = (m) => m.recipeId === recipe.id || m.sides?.some((s) => s.recipeId === recipe.id)
  const upcoming = plan.meals.filter((m) => usesThis(m) && (m.date ? m.date >= now : m.cycle >= addDays(now, -13)))
  const goesWith = isSide ? mainsFor(recipe.id, recipes) : pairedSides(recipe, recipesById)
  const rating = recipeRatings(plan, recipe.id)

  return (
    <article className="recipe-view">
      <a href={category === 'main' ? '#/' : `#/?cat=${category}`} className="small back-link">
        ← Recipes
      </a>
      <div className="recipe-head">
        <h1>{recipe.name}</h1>
        <div className="head-actions">
          {!isSide && <button onClick={(e) => e.detail <= 1 && actions.addToPlan(recipe.id, scale)}>+ Add to plan</button>}
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
        {rating.times > 0 ? (
          <button className="link small" onClick={() => document.getElementById('ratings')?.scrollIntoView({ behavior: 'smooth' })}>
            ★ {formatRating(rating.average)} ({Object.entries(rating.byPerson).map(([p, n]) => `${p} ${formatRating(n)}`).join(', ')})
          </button>
        ) : (
          !isSide && (
            <button className="link small" onClick={() => document.getElementById('ratings')?.scrollIntoView({ behavior: 'smooth' })}>
              ☆ Rate it
            </button>
          )
        )}
        {goesWith.length > 0 && (
          <span>
            Goes with{' '}
            {goesWith.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ', '}
                <a href={`#/recipe/${r.id}`}>{r.name}</a>
              </span>
            ))}
          </span>
        )}
        {upcoming.length > 0 && (
          <a href={`#/plan/${upcoming[0].cycle}`}>
            Planned: {upcoming.map((m) => (m.date ? formatDay(m.date) : `${formatCycle(m.cycle)}, not on a day`)).join('; ')}
          </a>
        )}
      </div>

      <p className="view-servings">
        <ServingsEditor recipe={recipe} actions={actions} />
      </p>

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
                    {realServings(recipe) ? ` (${formatQuantity(realServings(recipe) * s)} servings)` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {ingredients.length === 0 && <p className="muted small">No ingredients yet.</p>}
          {groups.map((group) => (
            <div key={group}>
              {group && <h3 className="group-label">{group}</h3>}
              <ul className="ingredient-list">
                {ingredients
                  .filter((i) => (i.group ?? '') === group)
                  .map((i) => (
                    <li key={i.id}>
                      <strong>
                        <IngredientAmount ing={i} scale={scale} edges={edgesOf(i)} picked={units[i.id]} onPick={(u) => pickUnit(i.id, u)} />
                      </strong>{' '}
                      {i.item}
                      {i.note && <span className="muted">, {i.note}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="view-steps">
          <div className="steps-head">
            <h2>Steps</h2>
            {usesByStep.some((u) => u.length) && <span className="muted small steps-uses-label">For this step</span>}
          </div>
          {steps.length === 0 ? (
            <p className="muted small">
              No steps yet. <a href={`#/recipe/${recipe.id}/edit`}>Add some</a>.
            </p>
          ) : (
            <ol className="read-steps">
              {steps.map((s, i) => (
                <li key={i}>
                  <div className="step-body">
                    <p>
                      {splitAmounts(s).map((part, k) =>
                        typeof part === 'string' ? (
                          part
                        ) : (
                          <Amount
                            key={k}
                            qty={part.qty}
                            unit={part.unit}
                            label={part.text}
                            edges={STANDARD_EDGES}
                            picked={textUnits[`${i}:${k}`]}
                            onPick={(u) => setTextUnits((t) => ({ ...t, [`${i}:${k}`]: u }))}
                          />
                        ),
                      )}
                    </p>
                    {usesByStep[i].length > 0 && (
                      <ul className="step-uses" aria-label={`Ingredients for step ${i + 1}`}>
                        {usesByStep[i].map((line) => (
                          <li key={line.id}>
                            <StepUse line={line} edges={edgesOf(line)} picked={units[line.id]} onPick={(u) => pickUnit(line.id, u)} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {scale !== 1 && <p className="muted small">Amounts in the steps are as written, not scaled.</p>}
        </section>
      </div>

      {(rating.times > 0 || !isSide) && (
        <section id="ratings" className="rating-history">
          <h2>Ratings</h2>
          {!isSide && <RateForm key={recipe.id} meal={recentMeal(plan, recipe.id, now)} people={people} onSave={(r, note) => actions.rateRecipe(recipe.id, r, note)} />}
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

/**
 * Rate it after cooking: a score per person and a note. Fills in from this
 * week's meal of it if there is one; otherwise saving counts it as made today.
 */
function RateForm({ meal, people, onSave }) {
  const [ratings, setRatings] = useState(meal?.ratings ?? {})
  const [note, setNote] = useState(meal?.ratingNote ?? '')
  useEffect(() => {
    setRatings(meal?.ratings ?? {})
    setNote(meal?.ratingNote ?? '')
  }, [meal?.id, JSON.stringify(meal?.ratings), meal?.ratingNote])
  const changed = JSON.stringify(ratings) !== JSON.stringify(meal?.ratings ?? {}) || note.trim() !== (meal?.ratingNote ?? '')
  const any = Object.keys(ratings).length > 0
  return (
    <div className="rate-form small">
      <span>{meal ? `How was it on ${formatDay(meal.date)}?` : 'Made it this week? Rate it:'}</span>
      {people.map((p) => (
        <span key={p} className="rating-input" role="group" aria-label={`${p}'s rating`}>
          <span className="rating-person">{p}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={ratings[p] >= n ? 'on' : ''}
              aria-pressed={ratings[p] === n}
              aria-label={`${p}: ${n} out of 5`}
              onClick={() =>
                setRatings((r) => {
                  const { [p]: _, ...rest } = r
                  // Clicking the current score clears it.
                  return r[p] === n ? rest : { ...rest, [p]: n }
                })
              }
            >
              ★
            </button>
          ))}
        </span>
      ))}
      <input className="rating-note" aria-label="Note about this meal" placeholder="Note (e.g. needed more salt)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="primary" disabled={!changed || (!any && !meal)} onClick={() => onSave(ratings, note.trim())}>
        Save rating
      </button>
    </div>
  )
}

/**
 * An amount that can be shown in another unit: click it for the units it
 * converts to, and pick one. `picked` is the unit chosen, if any.
 */
function Amount({ qty, unit, label, edges, picked, onPick }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  // Clicking anywhere else closes the menu (some browsers don't focus a clicked button, so blur alone misses it).
  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const choices = unitChoices(qty, unit, edges)
  const converted = picked != null ? convertQty(qty, unit, picked, edges) : null
  const text = converted != null ? formatAmount(converted, picked) : (label ?? formatAmount(qty, unit))
  if (!choices.length) return text
  const current = converted != null ? picked : unit
  const options = [{ qty, unit }, ...choices].sort((a, b) => a.qty - b.qty)
  return (
    <span
      ref={box}
      className={`amount-swap${open ? ' open' : ''}`}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <button type="button" className="amount" aria-haspopup="menu" aria-expanded={open} title="Show in another unit" onClick={() => setOpen((o) => !o)}>
        {text}
      </button>
      <span className="unit-menu" role="menu">
        {options.map((o) => (
          <button
            key={o.unit}
            type="button"
            role="menuitemradio"
            aria-checked={o.unit === current}
            onClick={() => {
              onPick(o.unit === unit ? null : o.unit)
              setOpen(false)
            }}
          >
            {formatAmount(o.qty, o.unit) || formatQuantity(o.qty)}
          </button>
        ))}
      </span>
    </span>
  )
}

/** An ingredient's amount in the list, scaled; shown as written when it isn't a number. */
function IngredientAmount({ ing, scale, edges, picked, onPick }) {
  const written = scaleQuantity(ing.quantity, scale)
  const qty = parseQuantity(written)
  if (qty == null) return [written, ing.unit].filter((s) => s && String(s).trim()).join(' ')
  return <Amount qty={qty} unit={normalizeUnit(ing.unit)} edges={edges} picked={picked} onPick={onPick} />
}

/** "1 tbsp olive oil (2 remaining)": what a step uses of one ingredient. */
function StepUse({ line, edges, picked, onPick }) {
  // The leftover reads in the same unit as the amount, and drops the unit when it matches.
  const shownUnit = picked != null && convertQty(1, line.unit, picked, edges) != null ? picked : line.unit
  const inShown = line.rest && convertQty(line.rest.qty, line.rest.unit, shownUnit, edges)
  const rest = !line.rest ? '' : inShown != null ? formatAmount(inShown, '') : formatAmount(line.rest.qty, line.rest.unit)
  return (
    <>
      {line.qty != null && (
        <strong>
          <Amount qty={line.qty} unit={line.unit} edges={edges} picked={picked} onPick={onPick} />
        </strong>
      )}
      {line.text && <strong>{line.text}</strong>} {line.item}
      {line.note && <span className="muted">, {line.note}</span>}
      {rest && <span className="muted"> ({rest} remaining)</span>}
    </>
  )
}
