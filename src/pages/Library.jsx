import { useMemo, useState } from 'react'
import { activeIngredients, modificationCount } from '../lib/recipe.js'

export default function Library({ recipes, plan, actions }) {
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState([])

  const allTags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort(), [recipes])

  const q = query.trim().toLowerCase()
  const visible = recipes.filter((r) => {
    if (activeTags.some((t) => !(r.tags ?? []).includes(t))) return false
    if (!q) return true
    return (
      r.name.toLowerCase().includes(q) ||
      activeIngredients(r).some((i) => i.item.toLowerCase().includes(q))
    )
  })

  const toggleTag = (tag) =>
    setActiveTags((ts) => (ts.includes(tag) ? ts.filter((t) => t !== tag) : [...ts, tag]))

  const plannedCount = (id) => plan.entries.filter((e) => e.recipeId === id).length

  return (
    <section>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search recipes or ingredients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {allTags.length > 0 && (
        <div className="tags">
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`tag ${activeTags.includes(tag) ? 'on' : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {recipes.length === 0 && (
        <p className="muted">No recipes yet. Ask Claude to import one with the import-recipe skill.</p>
      )}

      <div className="cards">
        {visible.map((r) => {
          const mods = modificationCount(r)
          const planned = plannedCount(r.id)
          return (
            <article key={r.id} className="card">
              <a href={`#/recipe/${r.id}`} className="card-title">
                {r.name}
              </a>
              <div className="muted small">
                {activeIngredients(r).length} ingredients
                {mods > 0 && ` · ${mods} modified`}
                {r.notes && ' · has notes'}
              </div>
              <div className="tags">
                {(r.tags ?? []).map((t) => (
                  <span key={t} className="tag static">
                    {t}
                  </span>
                ))}
              </div>
              <div className="card-actions">
                <button onClick={() => actions.addToPlan(r.id)}>+ Add to plan</button>
                {planned > 0 && <span className="muted small">In plan ×{planned}</span>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
