import { useMemo, useState } from 'react'
import { activeIngredients, modificationCount } from '../lib/recipe.js'

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  ingredients: (a, b) => a.ingredientCount - b.ingredientCount,
  servings: (a, b) => (a.servings ?? Infinity) - (b.servings ?? Infinity),
}

const sourceSite = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function Library({ recipes, plan, registry, actions }) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState([])
  const [sort, setSort] = useState({ key: 'name', dir: 1 })

  const allTags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort(), [recipes])

  const rows = useMemo(
    () =>
      recipes.map((r) => {
        const ingredients = activeIngredients(r)
        return {
          ...r,
          ingredients,
          ingredientCount: ingredients.length,
          // Non-staples are what distinguish a recipe (and what you'd shop for).
          keyIngredients: ingredients.filter((i) => i.item && !registry.ingredients[i.ingredientId]?.staple).map((i) => i.item),
          mods: modificationCount(r),
          planned: plan.entries.filter((e) => e.recipeId === r.id).length,
        }
      }),
    [recipes, plan, registry],
  )

  const q = query.trim().toLowerCase()
  const visible = rows
    .filter((r) => activeTags.every((t) => (r.tags ?? []).includes(t)))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.item.toLowerCase().includes(q)))
    .sort((a, b) => SORTS[sort.key](a, b) * sort.dir || SORTS.name(a, b))

  const toggleTag = (tag) =>
    setActiveTags((ts) => (ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag]))

  const sortHeader = (key, label, className) => (
    <th className={`sortable ${className ?? ''}`}>
      <button
        className="link"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
        aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
      >
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
          placeholder="Search recipes or ingredients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <a className="button primary" href="#/new">
          + New recipe
        </a>
      </div>
      {allTags.length > 0 && (
        <div className="tags">
          {allTags.map((tag) => (
            <button key={tag} className={`tag ${activeTags.includes(tag) ? 'on' : ''}`} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button className="link small" onClick={() => setActiveTags([])}>
              Clear filters
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
          </p>
          <table className="recipe-table">
            <thead>
              <tr>
                {sortHeader('name', 'Recipe', 'col-name')}
                <th className="col-key">Key ingredients</th>
                <th className="col-tags">Tags</th>
                {sortHeader('ingredients', 'Ingredients', 'col-num')}
                {sortHeader('servings', 'Servings', 'col-num')}
                <th className="col-changes">Your changes</th>
                <th className="col-plan">Plan</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="col-name">
                    <a href={`#/recipe/${r.id}`} className="recipe-link">
                      {r.name}
                    </a>
                    {sourceSite(r.source) && <div className="muted small">{sourceSite(r.source)}</div>}
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
                          onClick={() => toggleTag(t)}
                          title={`Filter by ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="col-num">{r.ingredientCount}</td>
                  <td className="col-num">{r.servings ?? <span className="muted">—</span>}</td>
                  <td className="col-changes small">
                    {r.mods > 0 && <span>{r.mods} modified</span>}
                    {r.mods > 0 && r.notes && <br />}
                    {r.notes && <span className="muted">has notes</span>}
                    {!r.mods && !r.notes && <span className="muted">—</span>}
                  </td>
                  <td className="col-plan">
                    <button onClick={() => actions.addToPlan(r.id)} title="Add to meal plan">
                      + Add
                    </button>
                    {r.planned > 0 && <span className="muted small planned">×{r.planned} planned</span>}
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
