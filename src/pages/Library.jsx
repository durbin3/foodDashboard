import { useEffect, useMemo, useState } from 'react'
import { cycleStart, formatDay, today } from '../lib/plan.js'
import { formatRating, recipeRatings } from '../lib/ratings.js'
import { activeIngredients, CATEGORIES, categoryOf, formatMinutes, isHandMade, modificationCount, recipeIssues, totalMinutes } from '../lib/recipe.js'
import { realServings } from '../lib/meals.js'
import { EFFORT_LABELS } from '../lib/settings.js'

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  servings: (a, b) => (realServings(a) ?? Infinity) - (realServings(b) ?? Infinity),
  effort: (a, b) => (a.effort ?? Infinity) - (b.effort ?? Infinity),
  minutes: (a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity),
  // Best first when ascending; unrated last.
  rating: (a, b) => (b.rating.average ?? -Infinity) - (a.rating.average ?? -Infinity),
  // Most recent first when ascending; never-made recipes last.
  lastMade: (a, b) => (b.lastMade ?? '').localeCompare(a.lastMade ?? ''),
}

const sourceSite = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** Filters and sort live in the URL, so they survive opening a recipe and coming back. */
function useUrlState(query) {
  const [state, setState] = useState(() => ({
    cat: CATEGORIES.some(([c]) => c === query.get('cat')) ? query.get('cat') : 'main',
    q: query.get('q') ?? '',
    tags: query.get('tags')?.split(',').filter(Boolean) ?? [],
    attention: query.get('attention') === '1',
    sort: { key: SORTS[query.get('sort')] ? query.get('sort') : 'name', dir: query.get('dir') === 'desc' ? -1 : 1 },
  }))
  useEffect(() => {
    const p = new URLSearchParams()
    if (state.cat !== 'main') p.set('cat', state.cat)
    if (state.q) p.set('q', state.q)
    if (state.tags.length) p.set('tags', state.tags.join(','))
    if (state.attention) p.set('attention', '1')
    if (state.sort.key !== 'name') p.set('sort', state.sort.key)
    if (state.sort.dir < 0) p.set('dir', 'desc')
    const qs = p.toString()
    history.replaceState(null, '', qs ? `#/?${qs}` : '#/')
  }, [state])
  return [state, (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))]
}

export default function Library({ recipes, plan, anchor, registry, query, actions }) {
  const [{ cat, q: search, tags: activeTags, attention, sort }, set] = useUrlState(query)
  const highlight = query.get('new')

  useEffect(() => {
    if (highlight) document.getElementById(`recipe-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [highlight])

  const counts = useMemo(() => Object.fromEntries(CATEGORIES.map(([c]) => [c, recipes.filter((r) => categoryOf(r) === c).length])), [recipes])
  const inTab = useMemo(() => recipes.filter((r) => categoryOf(r) === cat), [recipes, cat])
  const allTags = useMemo(() => [...new Set(inTab.flatMap((r) => r.tags ?? []))].sort(), [inTab])

  const rows = useMemo(() => {
    const now = today()
    const current = cycleStart(anchor)
    return inTab.map((r) => {
      const ingredients = activeIngredients(r)
      // Non-staples are what distinguish a recipe (and what you'd shop for); if
      // everything is a staple (e.g. gravy), show the ingredients themselves.
      const distinctive = ingredients.filter((i) => i.item && !registry.ingredients[i.ingredientId]?.staple).map((i) => i.item)
      const meals = plan.meals.filter((m) => m.recipeId === r.id || m.sides?.some((s) => s.recipeId === r.id))
      const past = meals.filter((m) => m.date && m.date < now).map((m) => m.date).sort()
      const upcoming = meals
        .filter((m) => (m.date ? m.date >= now : m.cycle >= current))
        .sort((a, b) => (a.date ?? `${a.cycle}~`).localeCompare(b.date ?? `${b.cycle}~`))
      return {
        ...r,
        ingredients,
        keyIngredients: distinctive.length ? distinctive : ingredients.map((i) => i.item).filter(Boolean),
        mods: modificationCount(r),
        handMade: isHandMade(r),
        issues: recipeIssues(r),
        lastMade: past.at(-1) ?? null,
        upcoming,
        minutes: totalMinutes(r),
        rating: recipeRatings(plan, r.id),
      }
    })
  }, [inTab, plan, anchor, registry])

  const q = search.trim().toLowerCase()
  const matches = (r) =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    r.ingredients.some((i) => i.item.toLowerCase().includes(q)) ||
    (r.tags ?? []).some((t) => t.includes(q)) ||
    (r.notes ?? '').toLowerCase().includes(q)
  const visible = rows
    .filter((r) => activeTags.every((t) => (r.tags ?? []).includes(t)))
    .filter((r) => !attention || r.issues.length)
    .filter(matches)
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir || SORTS.name(a, b))
  const needingAttention = rows.filter((r) => r.issues.length).length

  const toggleTag = (tag) => set((s) => ({ tags: s.tags.includes(tag) ? s.tags.filter((t) => t !== tag) : [...s.tags, tag] }))
  const filtered = activeTags.length > 0 || attention || q

  const sortHeader = (key, label, className) => (
    <th className={`sortable ${className ?? ''}`} aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button className="link" onClick={() => set((s) => ({ sort: { key, dir: s.sort.key === key ? -s.sort.dir : 1 } }))}>
        {label}
        {sort.key === key && (sort.dir > 0 ? ' ▲' : ' ▼')}
      </button>
    </th>
  )

  return (
    <section>
      <nav className="subtabs" aria-label="Kind of recipe">
        {CATEGORIES.filter(([c]) => counts[c] > 0 || c === cat || c === 'main').map(([c, label]) => (
          <button
            key={c}
            className={c === cat ? 'active' : ''}
            aria-current={c === cat ? 'page' : undefined}
            onClick={() => set({ cat: c, tags: [], attention: false })}
          >
            {label} <span className="muted small">{counts[c]}</span>
          </button>
        ))}
      </nav>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search names, ingredients, tags, notes…"
          aria-label="Search recipes"
          value={search}
          onChange={(e) => set({ q: e.target.value })}
        />
        <a className="button primary" href="#/new">
          + New recipe
        </a>
      </div>
      {allTags.length > 0 && (
        <div className="tags" role="group" aria-label="Filter by tag">
          {allTags.map((tag) => (
            <button key={tag} className={`tag ${activeTags.includes(tag) ? 'on' : ''}`} aria-pressed={activeTags.includes(tag)} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
          {needingAttention > 0 && (
            <button className={`tag attention ${attention ? 'on' : ''}`} aria-pressed={attention} onClick={() => set((s) => ({ attention: !s.attention }))}>
              needs attention ({needingAttention})
            </button>
          )}
        </div>
      )}

      {recipes.length === 0 ? (
        <p className="muted">No recipes yet. Add one with "+ New recipe", or ask Claude to import one with the import-recipe skill.</p>
      ) : inTab.length === 0 ? (
        <p className="muted">None of this kind yet. Set a recipe's Kind in its editor to file it here.</p>
      ) : (
        <>
          <p className="muted small">
            Showing {visible.length} of {inTab.length} {CATEGORIES.find(([c]) => c === cat)[1].toLowerCase()}
            {activeTags.length > 1 && ` tagged ${activeTags.join(' and ')}`}
            {filtered && (
              <>
                {' · '}
                <button className="link small" onClick={() => set({ q: '', tags: [], attention: false })}>
                  Clear filters
                </button>
              </>
            )}
          </p>
          <table className="recipe-table">
            <thead>
              <tr>
                {sortHeader('name', 'Recipe', 'col-name')}
                <th className="col-key">Key ingredients</th>
                <th className="col-tags">Tags</th>
                {sortHeader('rating', 'Rating', 'col-num')}
                {sortHeader('effort', 'Effort', 'col-num')}
                {sortHeader('minutes', 'Time', 'col-num col-time')}
                {sortHeader('servings', 'Servings', 'col-num')}
                {sortHeader('lastMade', 'Last made', 'col-date')}
                <th className="col-plan">Plan</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} id={`recipe-${r.id}`} className={r.id === highlight ? 'highlight' : ''}>
                  <td className="col-name">
                    <a href={`#/recipe/${r.id}`} className="recipe-link">
                      {r.name}
                    </a>
                    <div className="muted small meta-line">
                      {[sourceSite(r.source), r.handMade ? 'your recipe' : r.mods > 0 && `${r.mods} change${r.mods === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')}
                      {r.issues.length > 0 && (
                        <span className="badge warn-badge" title="Open the recipe and choose Edit to fix">
                          ⚠ {r.issues.join(', ')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="col-key small" title={r.keyIngredients.join(', ')}>
                    <span className="clamp">{r.keyIngredients.join(', ')}</span>
                  </td>
                  <td className="col-tags">
                    <div className="tags compact">
                      {(r.tags ?? []).map((t) => (
                        <button
                          key={t}
                          className={`tag ${activeTags.includes(t) ? 'on' : 'static'}`}
                          aria-pressed={activeTags.includes(t)}
                          onClick={() => toggleTag(t)}
                          title={`Filter by ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td
                    className="col-num"
                    title={
                      r.rating.times
                        ? `${Object.entries(r.rating.byPerson)
                            .map(([p, n]) => `${p} ${formatRating(n)}`)
                            .join(' · ')} (rated ${r.rating.times} time${r.rating.times === 1 ? '' : 's'})`
                        : 'Not rated yet'
                    }
                  >
                    {r.rating.times ? `★ ${formatRating(r.rating.average)}` : <span className="muted">—</span>}
                  </td>
                  <td className="col-num" title={r.effort ? EFFORT_LABELS[r.effort] : 'Effort not set'}>
                    {r.effort ?? <span className="muted">—</span>}
                  </td>
                  <td className="col-num col-time small">{r.minutes != null ? formatMinutes(r.minutes) : <span className="muted">—</span>}</td>
                  <td className="col-num" title={r.trueServings != null && r.servings != null ? `Recipe says ${r.servings}` : undefined}>
                    {realServings(r) ?? <span className="muted">—</span>}
                  </td>
                  <td className="col-date small">{r.lastMade ? formatDay(r.lastMade) : <span className="muted">—</span>}</td>
                  <td className="col-plan">
                    {cat !== 'side' && (
                      <button
                        onClick={(e) => e.detail <= 1 && actions.addToPlan(r.id)}
                        title="Add to the meal plan"
                        aria-label={`Add ${r.name} to meal plan`}
                      >
                        + Add
                      </button>
                    )}
                    {/* Always takes a line, so adding a meal doesn't shift the button under the cursor. */}
                    <div className="planned small">
                      {r.upcoming.length > 0 ? (
                        <a className="muted" href={`#/plan/${r.upcoming[0].cycle}`}>
                          {r.upcoming[0].date ? formatDay(r.upcoming[0].date) : 'not on a day'}
                          {r.upcoming.length > 1 && ` +${r.upcoming.length - 1}`}
                        </a>
                      ) : (
                        ' '
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="muted">No recipes match.</p>}
        </>
      )}
    </section>
  )
}
