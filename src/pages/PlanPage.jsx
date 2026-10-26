import { useEffect, useMemo, useRef, useState } from 'react'
import { formatQuantity } from '../lib/quantity.js'
import { addDays, CYCLE_DAYS, cycleStart, formatCycle, formatDay, formatShortDay, mealsForCycle, today } from '../lib/plan.js'
import { mealEffort, pairedSides } from '../lib/meals.js'
import { categoryOf, formatMinutes, totalMinutes } from '../lib/recipe.js'
import { formatRating } from '../lib/ratings.js'
import { buildRecommendation, cycleDays, cycleWarnings, freeDays, recommendationStillFits } from '../lib/schedule.js'
import { fillCycle, suggestMeals } from '../lib/suggest.js'
import { EFFORT_LABELS } from '../lib/settings.js'

/**
 * One shopping cycle: the meals picked for it, and 14 day slots to drag them
 * into. Clicking a meal opens a panel with the same moves (for touch screens
 * and keyboards), its scale, and ratings once it's been made.
 */
export default function PlanPage({ plan, cycle, settings, recipes, recipesById, registry, inventory, actions }) {
  const [recipeText, setRecipeText] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const recipeInput = useRef(null)
  const cycleInfo = cycleDays(cycle, settings)
  const days = cycleInfo.map((d) => d.date)
  const now = today()
  const current = cycleStart(settings.cycleStart)
  const meals = mealsForCycle(plan, cycle)

  // The saved recommendation, unless something besides following it has changed since.
  const stored = plan.recommendations?.[cycle]
  const context = { meals, days: cycleInfo, now, recipesById, registry, settings }
  const fits = recommendationStillFits(stored, context)
  const fresh = useMemo(
    () => (fits || !meals.some((m) => !m.date) || !freeDays(cycleInfo, meals, now).length ? null : buildRecommendation(context)),
    [fits, plan, cycle, settings, recipesById, registry, now],
  )
  const rec = fits ? stored : fresh
  useEffect(() => {
    if (fresh) actions.setRecommendation(cycle, fresh)
  }, [fresh])
  const suggestionFor = (m) => (rec && !m.date ? rec.days[m.id] : undefined)
  const suggestedOn = (date) => meals.find((m) => suggestionFor(m) === date)
  const suggestions = meals.filter((m) => suggestionFor(m))
  const warnings = cycleWarnings(context)

  // Meals worth adding, re-ranked after every pick. Only while there are days left to cook.
  const openDays = freeDays(cycleInfo, meals, now).length
  const suggestContext = { picked: meals, recipes, recipesById, registry, inventory, plan, now, weights: settings.weights }
  const ranked = useMemo(() => (openDays ? suggestMeals(suggestContext) : []), [openDays, meals, recipes, registry, inventory, plan, now, settings.weights])
  const unplaced = meals.filter((m) => !m.date)
  const toFill = Math.max(0, openDays - unplaced.length)
  const selected = meals.find((m) => m.id === selectedId)
  // Sides get attached to a meal rather than planned on their own.
  const plannable = recipes.filter((r) => categoryOf(r) !== 'side')
  const sides = recipes.filter((r) => categoryOf(r) === 'side')
  const byName = new Map(plannable.map((r) => [r.name.toLowerCase(), r]))
  const picked = byName.get(recipeText.trim().toLowerCase())

  useEffect(() => setSelectedId(null), [cycle])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelectedId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function add(e) {
    e.preventDefault()
    if (!picked) return
    const id = actions.addToPlan(picked.id)
    // Open the new meal when it has sides to suggest.
    if (pairedSides(picked, recipesById).length) setSelectedId(id)
    setRecipeText('')
    recipeInput.current?.focus()
  }

  const budget = (date) => cycleInfo.find((d) => d.date === date)?.budget ?? null
  const needsRating = (m) => m.date && m.date < now && settings.people.some((p) => m.ratings?.[p] == null)

  /** Drop handlers for a day (`date`) or the Meals section (`date` null). */
  const dropZone = (key, date) => ({
    onDragOver: (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTarget !== key) setDropTarget(key)
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setDropTarget(null),
    onDrop: (e) => {
      e.preventDefault()
      setDropTarget(null)
      const meal = meals.find((m) => m.id === e.dataTransfer.getData('text/plain'))
      if (meal && meal.date !== date) actions.updateMeal(meal.id, { date })
    },
  })

  const card = (m, date) => (
    <MealCard
      key={m.id}
      meal={m}
      recipe={recipesById[m.recipeId]}
      recipesById={recipesById}
      budget={date ? budget(date) : null}
      noCook={!!date && budget(date) == null}
      needsRating={needsRating(m)}
      warnings={warnings.byMeal[m.id]}
      suggestion={suggestionFor(m)}
      selected={m.id === selectedId}
      onSelect={() => setSelectedId(m.id === selectedId ? null : m.id)}
    />
  )

  const week = (i) => {
    const dates = days.slice(i * 7, i * 7 + 7)
    return (
      <div key={i} className="plan-week">
        <h3>
          Week {i + 1} <span className="muted small">{`${formatDay(dates[0])} – ${formatDay(dates[6])}`}</span>
        </h3>
        <div className="day-slots">
          {dates.map((d) => {
            const b = budget(d)
            const dayMeals = meals.filter((m) => m.date === d)
            const suggested = !dayMeals.length && suggestedOn(d)
            const classes = ['slot', d < now && 'past', d === now && 'today', b == null && 'no-cook', dropTarget === d && 'drop']
            return (
              <div key={d} className={classes.filter(Boolean).join(' ')} {...dropZone(d, d)}>
                <div className="slot-head">
                  <span className="slot-day">{formatShortDay(d)}</span>
                  <span className="muted small" title={b == null ? 'Set in Settings' : `Effort up to ${b}: ${EFFORT_LABELS[b]}`}>
                    {b == null ? 'no cooking' : `effort ≤ ${b}`}
                  </span>
                </div>
                {warnings.thaw[d]?.map((t) => (
                  <p key={t} className="thaw-note">
                    ❄ {t}
                  </p>
                ))}
                {dayMeals.map((m) => card(m, d))}
                {suggested && (
                  <button
                    className="meal-card suggested"
                    title="Suggested for this day. Click to put it here."
                    onClick={() => actions.updateMeal(suggested.id, { date: d })}
                  >
                    <span className="meal-name">{recipesById[suggested.recipeId]?.name ?? suggested.recipeId}</span>
                    <span className="meal-meta">Suggested · click to place</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <section className="plan">
      <div className="week-nav">
        <a className="button" href={`#/plan/${addDays(cycle, -CYCLE_DAYS)}`} aria-label="Previous two weeks">
          ‹
        </a>
        <h2>{formatCycle(cycle)}</h2>
        <a className="button" href={`#/plan/${addDays(cycle, CYCLE_DAYS)}`} aria-label="Next two weeks">
          ›
        </a>
        <span className="muted small">Shopping {formatDay(addDays(cycle, -1))}</span>
        {cycle !== current && (
          <a className="small" href={`#/plan/${current}`}>
            Current cycle
          </a>
        )}
        <span className="spacer" />
        <a className="button primary" href={`#/grocery/${cycle}`}>
          Grocery list →
        </a>
      </div>

      <div className={`meals-pool ${dropTarget === 'pool' ? 'drop' : ''}`} {...dropZone('pool', null)}>
        <div className="pool-head">
          <h3>
            Meals{' '}
            <span className="muted small">
              {meals.length === 0
                ? 'none picked yet'
                : `${meals.length} picked · ${unplaced.length ? `${unplaced.length} not on a day yet` : 'all on a day'}`}
            </span>
          </h3>
          <form className="toolbar" onSubmit={add}>
            <datalist id="recipe-names">
              {plannable.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
            <input
              ref={recipeInput}
              type="search"
              list="recipe-names"
              placeholder="Add a meal…"
              aria-label="Recipe to add"
              value={recipeText}
              onChange={(e) => setRecipeText(e.target.value)}
            />
            <button className="primary" disabled={!picked}>
              Add
            </button>
          </form>
        </div>
        {ranked.length > 0 && (
          <Suggestions
            ranked={ranked}
            toFill={toFill}
            weights={settings.weights}
            onAdd={(id) => actions.addToPlan(id)}
            onFill={() => actions.addMeals(fillCycle({ ...suggestContext, count: toFill }))}
            onWeights={(weights) => actions.updateSettings((s) => ({ ...s, weights: { ...s.weights, ...weights } }))}
          />
        )}
        {unplaced.length > 0 ? (
          <>
            <div className="pool-cards">{unplaced.map((m) => card(m, null))}</div>
            {suggestions.length > 0 && (
              <p className="small pool-actions">
                <button onClick={() => actions.placeMeals(Object.fromEntries(suggestions.map((m) => [m.id, suggestionFor(m)])))}>
                  Place {suggestions.length === unplaced.length ? 'all' : suggestions.length} as suggested
                </button>{' '}
                <span className="muted">
                  Suggestions fit each day's effort, use perishable ingredients early, and keep the same protein off back-to-back days.
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="muted small pool-empty">
            {meals.length ? 'Drag a meal here to take it off its day.' : 'Pick the meals that sound good for these two weeks, then drag each onto a day.'}
          </p>
        )}
      </div>

      {[0, 1].map(week)}

      <p className="muted small">
        Changes save automatically. Drag meals between days, or click one for more options.
        {meals.length > 0 && (
          <>
            {' '}
            <button className="link small" onClick={() => actions.clearMeals(meals)}>
              Clear these two weeks ({meals.length})
            </button>
          </>
        )}
      </p>

      {selected && (
        <MealPanel
          key={selected.id}
          meal={selected}
          recipe={recipesById[selected.recipeId]}
          recipesById={recipesById}
          sides={sides}
          days={days}
          budget={budget}
          warnings={warnings.byMeal[selected.id]}
          suggestion={suggestionFor(selected)}
          people={settings.people}
          now={now}
          actions={actions}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  )
}

const WEIGHTS = [
  ['cost', 'Shared ingredients', 'Prefer meals that need little you aren’t already buying'],
  ['variety', 'Variety', 'Avoid repeating a meal or a protein'],
  ['recency', 'Not made lately', 'Hold back meals made in the last few weeks'],
  ['effort', 'Effort fit', 'Match meals to how much effort each day allows'],
  ['freshness', 'Freshness', 'Use perishable ingredients before they go off'],
]

function Suggestions({ ranked, toFill, weights, onAdd, onFill, onWeights }) {
  const [shown, setShown] = useState(6)
  return (
    <div className="suggestions">
      <div className="suggestions-head small">
        <strong>Suggested</strong>
        <span className="muted">best first: liked, uses what you're already buying, not made lately</span>
        <span className="spacer" />
        {toFill > 0 && (
          <button className="small" onClick={onFill} title="Add the top suggestion, then the best one given that, and so on">
            Fill the {toFill} open day{toFill === 1 ? '' : 's'}
          </button>
        )}
        <details className="tune">
          <summary>Tune</summary>
          <div className="tune-panel">
            {WEIGHTS.map(([key, label, hint]) => (
              <label key={key} title={hint}>
                <span>{label}</span>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.5"
                  value={weights[key] ?? 1}
                  onChange={(e) => onWeights({ [key]: Number(e.target.value) })}
                />
                <span className="muted">{weights[key] ?? 1}×</span>
              </label>
            ))}
            <p className="muted">The first three rank these suggestions; variety, effort and freshness also decide which day each meal is suggested for.</p>
          </div>
        </details>
      </div>
      <div className="suggestion-list">
        {ranked.slice(0, shown).map((s) => (
          <button key={s.recipe.id} className="suggestion-card" onClick={() => onAdd(s.recipe.id)} title={`Add ${s.recipe.name}`}>
            <span className="meal-name">+ {s.recipe.name}</span>
            <span className="meal-meta muted">
              {[
                s.rating != null ? `★ ${formatRating(s.rating)}` : 'not rated',
                s.extra === 0 ? 'nothing new to buy' : `${s.extra} new to buy`,
                s.shared.length > 0 && `shares ${s.shared.slice(0, 2).join(', ')}${s.shared.length > 2 ? '…' : ''}`,
                s.lastMade != null && s.lastMade < 28 && `made ${s.lastMade} day${s.lastMade === 1 ? '' : 's'} ago`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
        {ranked.length > shown && (
          <button className="link small" onClick={() => setShown((n) => n + 6)}>
            More…
          </button>
        )}
      </div>
    </div>
  )
}

function MealCard({ meal, recipe, recipesById, budget, noCook, needsRating, warnings, suggestion, selected, onSelect }) {
  const effort = mealEffort(meal, recipesById)
  const over = budget != null && effort > budget
  const minutes = recipe && totalMinutes(recipe)
  const meta = [
    effort && `effort ${effort}`,
    minutes != null && formatMinutes(minutes),
    meal.scale !== 1 && `×${formatQuantity(meal.scale)}`,
    suggestion && `suggested ${formatShortDay(suggestion)}`,
    suggestion === null && 'no free day',
  ]
  const sideNames = (meal.sides ?? []).map((s) => recipesById[s.recipeId]?.name).filter(Boolean)
  return (
    <div
      className={`meal-card ${selected ? 'selected' : ''} ${over ? 'over' : ''} ${warnings ? 'stale' : ''}`}
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={[over && `Effort ${effort} is more than this day's ${budget}.`, ...(warnings ?? []), 'Drag to a day, or click for options.'].filter(Boolean).join('\n')}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', meal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <span className="meal-name">{recipe?.name ?? `Missing recipe: ${meal.recipeId}`}</span>
      {sideNames.length > 0 && <span className="meal-sides">+ {sideNames.join(', ')}</span>}
      <span className="meal-meta muted">
        {meta.filter(Boolean).join(' · ')}
        {over && <span className="warn"> · over</span>}
        {noCook && <span className="warn"> · no-cook day</span>}
        {warnings && <span className="warn"> · ⚠ freshness</span>}
        {needsRating && <span className="pill">rate</span>}
      </span>
    </div>
  )
}

function MealPanel({ meal, recipe, recipesById, sides, days, budget, warnings, suggestion, people, now, actions, onClose }) {
  const madeIt = meal.date && meal.date <= now
  const name = recipe?.name ?? meal.recipeId
  return (
    <div className="meal-panel" role="region" aria-label={`Options for ${name}`}>
      <div className="panel-row">
        <strong>{recipe ? <a href={`#/recipe/${recipe.id}`}>{name}</a> : name}</strong>
        <label className="small">
          Day{' '}
          <select value={meal.date ?? ''} onChange={(e) => actions.updateMeal(meal.id, { date: e.target.value || null })}>
            <option value="">Not on a day</option>
            {days.map((d) => (
              <option key={d} value={d}>
                {formatDay(d)}
                {budget(d) == null ? ' (no cooking)' : ` (effort ≤ ${budget(d)})`}
              </option>
            ))}
          </select>
        </label>
        {suggestion && (
          <button className="small" onClick={() => actions.updateMeal(meal.id, { date: suggestion })}>
            Place on {formatDay(suggestion)} (suggested)
          </button>
        )}
        <ScaleInput meal={meal} recipe={recipe} actions={actions} />
        <span className="spacer" />
        <button
          onClick={() => {
            onClose()
            actions.removeMeal(meal)
          }}
        >
          Remove
        </button>
        <button className="link" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {warnings?.map((w) => (
        <p key={w} className="panel-row warn small">
          ⚠ {w}
        </p>
      ))}
      <SidesRow meal={meal} recipe={recipe} recipesById={recipesById} sides={sides} actions={actions} />
      {madeIt && (
        <div className="panel-row ratings-row">
          <span className="small">How was it?</span>
          {people.map((p) => (
            <span key={p} className="rating-input small" role="group" aria-label={`${p}'s rating`}>
              <span className="rating-person">{p}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={meal.ratings?.[p] >= n ? 'on' : ''}
                  aria-pressed={meal.ratings?.[p] === n}
                  aria-label={`${p}: ${n} out of 5`}
                  onClick={() => {
                    const { [p]: _, ...rest } = meal.ratings ?? {}
                    // Clicking the current score clears it.
                    actions.updateMeal(meal.id, { ratings: meal.ratings?.[p] === n ? rest : { ...rest, [p]: n } })
                  }}
                >
                  ★
                </button>
              ))}
            </span>
          ))}
          <NoteInput meal={meal} actions={actions} />
        </div>
      )}
    </div>
  )
}

/** The sides on this meal, the main's usual pairings as one-click suggestions, and any other side from a menu. */
function SidesRow({ meal, recipe, recipesById, sides, actions }) {
  const attached = meal.sides ?? []
  const has = (id) => attached.some((s) => s.recipeId === id)
  const set = (next) => actions.updateMeal(meal.id, { sides: next.length ? next : undefined })
  // A side made for a scaled meal is scaled with it.
  const add = (id) => set([...attached, { recipeId: id, scale: meal.scale }])
  const suggested = pairedSides(recipe, recipesById).filter((s) => !has(s.id))
  const others = sides.filter((s) => !has(s.id) && !suggested.includes(s))
  if (!sides.length) return null
  return (
    <div className="panel-row sides-row small">
      <span>Sides</span>
      {attached.map((s) => (
        <span key={s.recipeId} className="tag static">
          {recipesById[s.recipeId]?.name ?? s.recipeId}
          <button className="link" aria-label={`Remove ${recipesById[s.recipeId]?.name ?? 'side'}`} onClick={() => set(attached.filter((x) => x !== s))}>
            ×
          </button>
        </span>
      ))}
      {suggested.map((s) => (
        <button key={s.id} className="tag suggestion" title={`Usually goes with ${recipe?.name}`} onClick={() => add(s.id)}>
          + {s.name}
        </button>
      ))}
      {others.length > 0 && (
        <select aria-label="Add another side" value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">{attached.length || suggested.length ? 'Other side…' : 'Add a side…'}</option>
          {others.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function ScaleInput({ meal, recipe, actions }) {
  // Edited as text and saved only when it's a positive number, so clearing
  // the box to type a new value doesn't save a blank.
  const [text, setText] = useState(String(meal.scale))
  useEffect(() => setText(String(meal.scale)), [meal.scale])
  const commit = () => {
    const n = Number(text)
    if (n > 0) n !== meal.scale && actions.updateMeal(meal.id, { scale: n })
    else setText(String(meal.scale))
  }
  const scale = Number(text) > 0 ? Number(text) : meal.scale
  return (
    <label className="small">
      Scale ×
      <input
        className="scale-input"
        type="number"
        min="0.25"
        step="0.25"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />{' '}
      <span className="muted">{recipe?.servings ? `${formatQuantity(recipe.servings * scale)} servings` : ''}</span>
    </label>
  )
}

function NoteInput({ meal, actions }) {
  const [text, setText] = useState(meal.ratingNote ?? '')
  useEffect(() => setText(meal.ratingNote ?? ''), [meal.ratingNote])
  const commit = () => text.trim() !== (meal.ratingNote ?? '') && actions.updateMeal(meal.id, { ratingNote: text.trim() || undefined })
  return (
    <input
      className="rating-note"
      aria-label="Note about this meal"
      placeholder="Note (e.g. needed more salt)"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
