import { useEffect, useMemo, useRef, useState } from 'react'
import { formatQuantity } from '../lib/quantity.js'
import { addDays, CYCLE_DAYS, cycleStart, formatCycle, formatDay, formatMonthDay, formatShortDay, mealsForCycle, today } from '../lib/plan.js'
import { leftoversToPlace, mealEffort, mealServings, pairedSides, realServings } from '../lib/meals.js'
import { categoryOf, formatMinutes, totalMinutes } from '../lib/recipe.js'
import { formatRating } from '../lib/ratings.js'
import { buildRecommendation, cycleDays, cycleWarnings, freeDays, recommendationStillFits, suggestLeftovers } from '../lib/schedule.js'
import { fillCycle, suggestMeals } from '../lib/suggest.js'
import { EFFORT_LABELS } from '../lib/settings.js'
import ServingsEditor from './ServingsEditor.jsx'

/**
 * One shopping cycle: the meals picked for it, and 14 day slots to drag them
 * into. Each day sets its own effort and whether we cook. Meals that make more
 * than one dinner have leftover nights, which drag onto later days too.
 * Clicking a meal opens a panel with the same moves (for touch screens and
 * keyboards), its scale and servings, and ratings once it's been made.
 */
export default function PlanPage({ plan, cycle, settings, recipes, recipesById, registry, inventory, actions }) {
  const [recipeText, setRecipeText] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const recipeInput = useRef(null)
  const cycleInfo = cycleDays(cycle, settings, plan.days)
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
  const servingsOf = (m) => mealServings(m, recipesById[m.recipeId])
  // Leftover nights of placed meals that aren't on a day yet, and where they'd go.
  const leftoverRec = suggestLeftovers({ ...context, suggested: suggestions.map(suggestionFor) })
  const leftoverOn = (date) => meals.find((m) => leftoverRec[m.id]?.includes(date))
  const looseLeftovers = meals
    .filter((m) => m.date)
    .flatMap((m) => Array.from({ length: leftoversToPlace(m, recipesById[m.recipeId]) }, (_, i) => [m, i]))

  // Meals worth adding, re-ranked after every pick. Only while there are days left to cook.
  const openDays = freeDays(cycleInfo, meals, now).length
  const suggestContext = { picked: meals, recipes, recipesById, registry, inventory, plan, now, weights: settings.weights }
  const ranked = useMemo(() => (openDays ? suggestMeals(suggestContext) : []), [openDays, meals, recipes, registry, inventory, plan, now, settings.weights])
  const unplaced = meals.filter((m) => !m.date)
  // Dinners covered without cooking on another open day: meals not on a day yet (with their leftovers), and leftovers still to place.
  const covered = unplaced.reduce((n, m) => n + (servingsOf(m)?.nights ?? 1), 0) + looseLeftovers.length
  const toFill = Math.max(0, openDays - covered)
  const dinners = meals.reduce((n, m) => n + (servingsOf(m)?.nights ?? 1), 0)
  const nightsOf = (recipeId) => mealServings({ scale: 1 }, recipesById[recipeId])?.nights ?? 1
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

  /** Moves one leftover night of `meal` from `from` (null: not on a day yet) to `to` (null: off its day). */
  function moveLeftover(meal, from, to) {
    if (to && to <= meal.date) {
      actions.notify(`Leftovers of ${recipesById[meal.recipeId]?.name ?? 'a meal'} have to come after ${formatDay(meal.date)}, when it's cooked.`)
      return
    }
    const rest = [...(meal.leftovers ?? [])]
    if (from) rest.splice(rest.indexOf(from), 1)
    actions.setLeftovers(meal.id, to ? [...rest, to] : rest)
  }

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
      // A meal is dragged as its id; a leftover night as "leftover:<meal id>:<its date, or blank>".
      const [kind, id, from] = e.dataTransfer.getData('text/plain').split(':')
      if (kind === 'leftover') {
        const meal = meals.find((m) => m.id === id)
        if (meal && (from || null) !== date) moveLeftover(meal, from || null, date)
        return
      }
      const meal = meals.find((m) => m.id === kind)
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
      servings={servingsOf(m)}
      suggestion={suggestionFor(m)}
      selected={m.id === selectedId}
      onSelect={() => setSelectedId(m.id === selectedId ? null : m.id)}
    />
  )

  /** One day's square: its effort and cooking, thaw reminders, and what's on it or suggested for it. */
  const slot = (d) => {
    const info = cycleInfo.find((x) => x.date === d)
    const b = info.budget
    const dayMeals = meals.filter((m) => m.date === d)
    const dayLeftovers = meals.filter((m) => m.leftovers?.includes(d))
    const empty = !dayMeals.length && !dayLeftovers.length
    const suggested = empty && suggestedOn(d)
    const leftoverSuggested = empty && !suggested && leftoverOn(d)
    const classes = ['slot', d < now && 'past', d === now && 'today', b == null && 'no-cook', dropTarget === d && 'drop']
    return (
      <div key={d} className={classes.filter(Boolean).join(' ')} {...dropZone(d, d)}>
        <div className="slot-head">
          <span className="slot-day">{formatMonthDay(d)}</span>
          <DayControls day={info} onChange={(patch) => actions.setDay(d, patch)} />
        </div>
        {warnings.thaw[d]?.map((t) => (
          <p key={t} className="thaw-note">
            ❄ {t}
          </p>
        ))}
        {dayMeals.map((m) => card(m, d))}
        {dayLeftovers.map((m) => (
          <LeftoverCard
            key={m.id}
            meal={m}
            date={d}
            recipe={recipesById[m.recipeId]}
            selected={m.id === selectedId}
            onSelect={() => setSelectedId(m.id === selectedId ? null : m.id)}
          />
        ))}
        {leftoverSuggested && (
          <button
            className="meal-card suggested leftover"
            title="Leftovers suggested for this day. Click to put them here."
            onClick={() => moveLeftover(leftoverSuggested, null, d)}
          >
            <span className="meal-name">↺ {recipesById[leftoverSuggested.recipeId]?.name ?? leftoverSuggested.recipeId}</span>
            <span className="meal-meta">Leftovers suggested · click to place</span>
          </button>
        )}
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
  }

  // The two weeks side by side, one row per weekday, so each weekday is named once.
  const calendar = (
    <div className="calendar">
      <div className="cal-row cal-head">
        <span />
        {[0, 1].map((w) => (
          <h3 key={w}>
            Week {w + 1} <span className="muted small">{`${formatMonthDay(days[w * 7])} – ${formatMonthDay(days[w * 7 + 6])}`}</span>
          </h3>
        ))}
      </div>
      {days.slice(0, 7).map((d, i) => (
        <div key={d} className="cal-row">
          <span className="cal-weekday">{WEEKDAY_SHORT[i]}</span>
          {slot(d)}
          {slot(days[i + 7])}
        </div>
      ))}
    </div>
  )

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

      <div className="plan-layout">
        <div className={`meals-pool ${dropTarget === 'pool' ? 'drop' : ''}`} {...dropZone('pool', null)}>
          <div className="pool-head">
            <h3>
              Meals{' '}
              <span className="muted small">
                {meals.length === 0
                  ? 'none picked yet'
                  : [
                      `${meals.length} picked`,
                      dinners > meals.length && `${dinners} dinners with leftovers`,
                      unplaced.length ? `${unplaced.length} not on a day yet` : 'all on a day',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
              onFill={() => actions.addMeals(fillCycle({ ...suggestContext, count: toFill, nights: nightsOf }))}
              onWeights={(weights) => actions.updateSettings((s) => ({ ...s, weights: { ...s.weights, ...weights } }))}
            />
          )}
          {looseLeftovers.length > 0 && (
            <div className="pool-leftovers">
              <p className="small">
                Leftovers not on a day yet{' '}
                {Object.keys(leftoverRec).length > 0 && (
                  <button
                    className="small"
                    onClick={() =>
                      Object.entries(leftoverRec).forEach(([id, dates]) => actions.setLeftovers(id, [...(meals.find((m) => m.id === id).leftovers ?? []), ...dates]))
                    }
                  >
                    Place as suggested
                  </button>
                )}
              </p>
              <div className="pool-cards">
                {looseLeftovers.map(([m, i]) => (
                  <LeftoverCard
                    key={`${m.id}-${i}`}
                    meal={m}
                    date={null}
                    recipe={recipesById[m.recipeId]}
                    selected={m.id === selectedId}
                    onSelect={() => setSelectedId(m.id === selectedId ? null : m.id)}
                  />
                ))}
              </div>
            </div>
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

        {calendar}
      </div>

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
          servings={servingsOf(selected)}
          leftoverSuggestion={leftoverRec[selected.id]}
          onLeftover={(from, to) => moveLeftover(selected, from, to)}
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

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const WEIGHTS = [
  ['cost', 'Shared ingredients', 'Prefer meals that need little you aren’t already buying'],
  ['variety', 'Variety', 'Avoid repeating a meal or a protein'],
  ['recency', 'Not made lately', 'Hold back meals made in the last few weeks'],
  ['effort', 'Effort fit', 'Match meals to how much effort each day allows'],
  ['freshness', 'Freshness', 'Use perishable ingredients before they go off'],
]

// Only the best few: more is noise. The rest come up as these get picked.
const SHOWN_SUGGESTIONS = 3

function Suggestions({ ranked, toFill, weights, onAdd, onFill, onWeights }) {
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
        {ranked.slice(0, SHOWN_SUGGESTIONS).map((s) => (
          <button key={s.recipe.id} className="suggestion-card" onClick={() => onAdd(s.recipe.id)} title={`Add ${s.recipe.name}`}>
            <span className="meal-name">+ {s.recipe.name}</span>
            <span className="meal-meta muted">
              {[
                s.rating != null ? `★ ${formatRating(s.rating)}` : 'not rated',
                s.shared.length > 0 && `shares ${s.shared.slice(0, 2).join(', ')}${s.shared.length > 2 ? '…' : ''}`,
                s.lastMade != null && s.lastMade < 28 && `made ${s.lastMade} day${s.lastMade === 1 ? '' : 's'} ago`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** A day's effort allowed and whether we cook, changed for just this date. ↺ puts back its weekday's usual. */
function DayControls({ day, onChange }) {
  return (
    <span className="day-controls">
      <label className="day-cook small" title={day.cook ? 'We cook this day. Untick for a night off or leftovers.' : "We don't cook this day"}>
        <input type="checkbox" checked={day.cook} onChange={(e) => onChange({ cook: e.target.checked })} /> cook
      </label>
      <select
        className="day-effort small"
        aria-label="Most effort this day"
        title={day.cook ? `Effort up to ${day.effort}: ${EFFORT_LABELS[day.effort]}` : 'No cooking'}
        value={day.effort}
        disabled={!day.cook}
        onChange={(e) => onChange({ effort: Number(e.target.value) })}
      >
        {Object.entries(EFFORT_LABELS).map(([n, label]) => (
          <option key={n} value={n} title={label}>
            effort ≤ {n}
          </option>
        ))}
      </select>
      {day.custom && (
        <button className="link small day-reset" title="Back to the usual for this weekday (set in Settings)" aria-label="Reset this day" onClick={() => onChange(null)}>
          ↺
        </button>
      )}
    </span>
  )
}

/** One leftover night of a meal: on a day (`date`), or waiting for one in the Meals section. Drags like a meal. */
function LeftoverCard({ meal, date, recipe, selected, onSelect }) {
  return (
    <div
      className={`meal-card leftover ${selected ? 'selected' : ''}`}
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={`Leftovers from ${formatDay(meal.date)}. Drag to another day, or click for options.`}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', `leftover:${meal.id}:${date ?? ''}`)
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
      <span className="meal-name">↺ {recipe?.name ?? meal.recipeId}</span>
      <span className="meal-meta muted">leftovers from {formatShortDay(meal.date)}</span>
    </div>
  )
}

function MealCard({ meal, recipe, recipesById, budget, noCook, needsRating, warnings, servings, suggestion, selected, onSelect }) {
  const effort = mealEffort(meal, recipesById)
  const over = budget != null && effort > budget
  const minutes = recipe && totalMinutes(recipe)
  const meta = [
    effort && `effort ${effort}`,
    minutes != null && formatMinutes(minutes),
    meal.scale !== 1 && `×${formatQuantity(meal.scale)}`,
    // "~" when it's from the recipe's stated servings, which are often off.
    servings?.leftovers > 0 && `${servings.guessed ? '~' : ''}${servings.nights} dinners`,
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

function MealPanel({ meal, recipe, recipesById, sides, days, budget, warnings, servings, leftoverSuggestion, onLeftover, suggestion, people, now, actions, onClose }) {
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
      {recipe && (
        <ServingsRow
          meal={meal}
          recipe={recipe}
          servings={servings}
          days={days}
          budget={budget}
          madeIt={madeIt}
          leftoverSuggestion={leftoverSuggestion}
          onLeftover={onLeftover}
          actions={actions}
        />
      )}
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

/**
 * How far the meal goes: the recipe's real servings (edited in place, so the
 * stated count can be corrected after cooking), and the later days its
 * leftovers are eaten on.
 */
function ServingsRow({ meal, recipe, servings, days, budget, madeIt, leftoverSuggestion, onLeftover, actions }) {
  const leftovers = meal.leftovers ?? []
  const toPlace = Math.max(0, (servings?.leftovers ?? 0) - leftovers.length)
  const later = days.filter((d) => meal.date && d > meal.date && !leftovers.includes(d))
  return (
    <div className="panel-row servings-row small">
      <ServingsEditor recipe={recipe} actions={actions} />
      {servings && meal.scale !== 1 && (
        <span className="muted">
          ×{formatQuantity(meal.scale)}: {formatQuantity(servings.servings)} servings, {servings.nights} dinner{servings.nights === 1 ? '' : 's'}
        </span>
      )}
      {servings?.spare > 0 && <span className="muted">+ {formatQuantity(servings.spare)} spare (lunch?)</span>}
      {madeIt && servings?.guessed && <span className="warn">How many did it really make? Fill in Makes so leftovers plan right.</span>}
      {meal.date ? (
        (servings?.leftovers > 0 || leftovers.length > 0) && (
          <span className="leftover-days">
            Leftovers
            {leftovers.map((d) => (
              <span key={d} className="tag static">
                {formatShortDay(d)}
                <button className="link" aria-label={`Take leftovers off ${formatDay(d)}`} onClick={() => onLeftover(d, null)}>
                  ×
                </button>
              </span>
            ))}
            {toPlace > 0 && leftoverSuggestion?.length > 0 && (
              <button className="tag suggestion" title="Suggested: the next free day while they keep" onClick={() => onLeftover(null, leftoverSuggestion[0])}>
                + {formatShortDay(leftoverSuggestion[0])}
              </button>
            )}
            {toPlace > 0 && later.length > 0 && (
              <select aria-label="Put leftovers on a day" value="" onChange={(e) => e.target.value && onLeftover(null, e.target.value)}>
                <option value="">{toPlace} more night{toPlace === 1 ? '' : 's'}: pick a day…</option>
                {later.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                    {budget(d) == null ? ' (no cooking)' : ''}
                  </option>
                ))}
              </select>
            )}
          </span>
        )
      ) : (
        servings?.leftovers > 0 && <span className="muted">Put it on a day to plan its leftover nights.</span>
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
      <span className="muted">{realServings(recipe) ? `${formatQuantity(realServings(recipe) * scale)} servings` : ''}</span>
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
