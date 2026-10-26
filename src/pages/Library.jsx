import { useEffect, useMemo, useState } from 'react'
import { formatDay, today } from '../lib/plan.js'
import { activeIngredients, isHandMade, modificationCount, recipeIssues } from '../lib/recipe.js'

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  servings: (a, b) => (a.servings ?? Infinity) - (b.servings ?? Infinity),
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
    q: query.get('q') ?? '',
    tags: query.get('tags')?.split(',').filter(Boolean) ?? [],
    attention: query.get('attention') === '1',
    sort: { key: SORTS[query.get('sort')] ? query.get('sort') : 'name', dir: query.get('dir') === 'desc' ? -1 : 1 },
  }))
  useEffect(() => {
    const p = new URLSearchParams()
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

export default function Library({ recipes, plan, registry, query, actions }) {
  const [{ q: search, tags: activeTags, attention, sort }, set] = useUrlState(query)
  const highlight = query.get('new')

  useEffect(() => {
    if (highlight) document.getElementById(`recipe-${highlight}`)?.scrollIntoView({ block: 'center' })
  }, [highlight])

  const allTags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort(), [recipes])

  const rows = useMemo(() => {
    const now = today()
    return recipes.map((r) => {
      const ingredients = activeIngredients(r)
      // Non-staples are what distinguish a recipe (and what you'd shop for); if
      // everything is a staple (e.g. gravy), show the ingredients themselves.
      const distinctive = ingredients.filter((i) => i.item && !registry.ingredients[i.ingredientId]?.staple).map((i) => i.item)
      const entries = plan.entries.filter((e) => e.recipeId === r.id)
      const past = entries.filter((e) => e.date && e.date < now).map((e) => e.date).sort()
      const upcoming = entries.filter((e) => !e.date || e.date >= now).sort((a, b) => (a.date ?? '￿').localeCompare(b.date ?? '￿'))
      return {
        ...r,
        ingredients,
        keyIngredients: distinctive.length ? distinctive : ingredients.map((i) => i.item).filter(Boolean),
        mods: modificationCount(r),
        handMade: isHandMade(r),
        issues: recipeIssues(r),
        lastMade: past.at(-1) ?? null,
        upcoming,
      }
    })
  }, [recipes, plan, registry])

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
      ) : (
        <>
          <p className="muted small">
            Showing {visible.length} of {recipes.length} recipes
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
                  <td className="col-num">{r.servings ?? <span className="muted">—</span>}</td>
                  <td className="col-date small">{r.lastMade ? formatDay(r.lastMade) : <span className="muted">—</span>}</td>
                  <td className="col-plan">
                    <button
                      onClick={(e) => e.detail <= 1 && actions.addToPlan(r.id)}
                      title="Add to the meal plan (unscheduled)"
                      aria-label={`Add ${r.name} to meal plan`}
                    >
                      + Add
                    </button>
                    {/* Always takes a line, so adding a meal doesn't shift the button under the cursor. */}
                    <div className="planned small">
                      {r.upcoming.length > 0 ? (
                        <a className="muted" href={`#/plan/${r.upcoming[0].date ?? ''}`}>
                          {r.upcoming[0].date ? formatDay(r.upcoming[0].date) : 'unscheduled'}
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
