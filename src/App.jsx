import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { formatDay, normalizePlan, weekStart } from './lib/plan.js'
import { newRecipe, withNames } from './lib/recipe.js'
import Library from './pages/Library.jsx'
import RecipeView from './pages/RecipeView.jsx'
import RecipePage from './pages/RecipePage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import GroceryPage from './pages/GroceryPage.jsx'
import IngredientsPage from './pages/IngredientsPage.jsx'

/**
 * The current hash as path parts plus query, e.g. "#/recipe/x/edit" → ['recipe', 'x', 'edit'].
 * `leaveGuard` can veto navigation (the recipe editor uses it when there are unsaved changes).
 */
function useHashRoute(leaveGuard) {
  const [hash, setHash] = useState(window.location.hash)
  const current = useRef(window.location.hash)
  useEffect(() => {
    const onChange = () => {
      if (leaveGuard.current?.() && !confirm('You have unsaved changes. Leave without saving?')) {
        history.replaceState(null, '', current.current || '#/')
        return
      }
      current.current = window.location.hash
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [leaveGuard])
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  return { parts: path.split('/').map(decodeURIComponent), query: new URLSearchParams(query) }
}

/**
 * State that's saved to the server on every change. Updates take a function of
 * the latest value (not the one from the last render), and saves go out one at
 * a time, so quick successive changes can't overwrite each other or land on
 * disk out of order.
 */
function usePersisted(initial, save, onSaving) {
  const [value, setValue] = useState(initial)
  const latest = useRef(initial)
  const queue = useRef(Promise.resolve())
  const update = (fn) => {
    const next = typeof fn === 'function' ? fn(latest.current) : fn
    latest.current = next
    setValue(next)
    onSaving(1)
    const saved = queue.current.catch(() => {}).then(() => save(next))
    queue.current = saved
    return saved.finally(() => onSaving(-1))
  }
  const replace = (next) => {
    latest.current = next
    setValue(next)
  }
  return [value, update, replace, latest]
}

const NAV = [
  ['', 'Recipes'],
  ['plan', 'Meal plan'],
  ['grocery', 'Grocery list'],
  ['ingredients', 'Ingredients'],
]

const byName = (a, b) => a.name.localeCompare(b.name)

export default function App() {
  const [storedRecipes, setStoredRecipes] = useState(null)
  const [toasts, setToasts] = useState([])
  const [pending, setPending] = useState(0)
  const onSaving = (d) => setPending((n) => n + d)
  const [plan, updatePlan, replacePlan] = usePersisted({ entries: [] }, (p) => run(api.savePlan(p)), onSaving)
  const [registry, updateRegistry, replaceRegistry, latestRegistry] = usePersisted(
    { ingredients: {} },
    (r) => run(api.saveIngredients(r)),
    onSaving,
  )
  const leaveGuard = useRef(null)
  const { parts, query } = useHashRoute(leaveGuard)
  const [page, param, sub] = parts
  // Recipe pages belong under the Recipes tab.
  const section = page === 'new' || page === 'recipe' ? '' : page || ''
  // The week the plan and grocery pages show; remembered across tabs.
  const [week, setWeek] = useState(weekStart())
  useEffect(() => {
    if ((page === 'plan' || page === 'grocery') && param) setWeek(weekStart(param))
  }, [page, param])

  function loadAll() {
    return Promise.all([api.listRecipes(), api.getPlan(), api.getIngredients()])
      .then(([r, p, i]) => {
        setStoredRecipes(r)
        replacePlan(normalizePlan(p))
        replaceRegistry(i)
      })
      .catch((err) => notify(err.message, { kind: 'error' }))
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Recipes store ingredient ids; the UI works with names resolved from the registry.
  const recipes = useMemo(() => storedRecipes && storedRecipes.map((r) => withNames(r, registry)), [storedRecipes, registry])
  const recipesById = useMemo(() => Object.fromEntries((recipes ?? []).map((r) => [r.id, r])), [recipes])
  // Stable so the editor doesn't reset its draft on every render.
  const blankRecipe = useMemo(() => newRecipe('', new Set()), [])
  const knownItems = useMemo(() => Object.values(registry.ingredients).map((i) => i.name).sort(), [registry])

  function notify(message, { kind = 'info', undo, link } = {}) {
    const id = crypto.randomUUID()
    setToasts((ts) => [...ts.slice(-1), { id, message, kind, undo, link }])
    setTimeout(() => dismiss(id), kind === 'error' ? 10000 : 6000)
  }
  const dismiss = (id) => setToasts((ts) => ts.filter((t) => t.id !== id))

  function run(promise) {
    return promise.catch((err) => {
      notify(err.message, { kind: 'error' })
      throw err
    })
  }

  // Recipe saves return the stored recipe plus the registry (which gains entries for new ingredient names).
  function applySaved({ recipe, ingredients }) {
    replaceRegistry(ingredients)
    setStoredRecipes((rs) => [...rs.filter((r) => r.id !== recipe.id), recipe].sort(byName))
    return recipe
  }

  const recipeName = (id) => recipesById[id]?.name ?? 'Recipe'
  const whenLabel = (date) => (date ? formatDay(date) : 'the plan (unscheduled)')
  const removeEntries = (ids) => updatePlan((p) => ({ ...p, entries: p.entries.filter((e) => !ids.includes(e.id)) }))
  const restoreEntries = (entries) => updatePlan((p) => ({ ...p, entries: [...p.entries, ...entries] }))

  const actions = {
    notify,
    setLeaveGuard: (fn) => (leaveGuard.current = fn),
    createRecipe: (recipe) => run(api.createRecipe(recipe)).then(applySaved),
    saveRecipe: (recipe) => run(api.saveRecipe(recipe)).then(applySaved),
    deleteRecipe: async (id) => {
      await run(api.deleteRecipe(id))
      setStoredRecipes((rs) => rs.filter((r) => r.id !== id))
      await updatePlan((p) => ({ ...p, entries: p.entries.filter((e) => e.recipeId !== id) }))
    },
    addToPlan: (recipeId, date = null, scale = 1) => {
      const entry = { id: crypto.randomUUID(), recipeId, date, scale }
      notify(`Added ${recipeName(recipeId)} to ${whenLabel(date)}.`, {
        undo: () => removeEntries([entry.id]),
        link: date ? null : { href: '#/plan', label: 'Pick a day' },
      })
      return updatePlan((p) => ({ ...p, entries: [...p.entries, entry] }))
    },
    updateEntry: (id, patch) => updatePlan((p) => ({ ...p, entries: p.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
    removeEntry: (entry) => {
      notify(`Removed ${recipeName(entry.recipeId)} from the plan.`, { undo: () => restoreEntries([entry]) })
      return removeEntries([entry.id])
    },
    clearEntries: (entries) => {
      notify(`Cleared ${entries.length} meal${entries.length === 1 ? '' : 's'}.`, { undo: () => restoreEntries(entries) })
      return removeEntries(entries.map((e) => e.id))
    },
    /** Patch one ingredient's settings (registering it if a recipe used an unknown id); undefined values are dropped when saved. */
    updateIngredient: (id, patch) =>
      updateRegistry((r) => ({ ...r, ingredients: { ...r.ingredients, [id]: { name: id, ...r.ingredients[id], ...patch } } })),
    deleteIngredient: (id) =>
      updateRegistry((r) => {
        const { [id]: _, ...ingredients } = r.ingredients
        return { ...r, ingredients }
      }),
    /** Merge rewrites recipe files; undo puts back the registry and the recipes it touched. */
    mergeIngredient: async (from, into) => {
      // An id a recipe uses but the registry lacks has to be registered before the server will merge it.
      for (const id of [from, into])
        if (!latestRegistry.current.ingredients[id])
          await updateRegistry((r) => ({ ...r, ingredients: { ...r.ingredients, [id]: { name: id } } }))
      const before = latestRegistry.current
      const touched = storedRecipes.filter((r) =>
        r.ingredients.some((i) => i.original?.ingredientId === from || i.modified?.ingredientId === from),
      )
      await run(api.mergeIngredient(from, into))
      await loadAll()
      notify(`Merged "${before.ingredients[from]?.name}" into "${before.ingredients[into]?.name}" (${touched.length} recipe${touched.length === 1 ? '' : 's'} updated).`, {
        undo: async () => {
          await run(api.saveIngredients(before))
          for (const r of touched) await run(api.saveRecipe(r))
          await loadAll()
          notify('Merge undone.')
        },
      })
    },
  }

  let content
  let title = ''
  if (!recipes) content = <p className="muted">Loading…</p>
  else if (page === 'new') {
    title = 'New recipe'
    content = (
      <RecipePage
        key="new"
        recipe={blankRecipe}
        isNew
        takenIds={new Set(recipes.map((r) => r.id))}
        knownItems={knownItems}
        allTags={[...new Set(recipes.flatMap((r) => r.tags ?? []))].sort()}
        actions={actions}
      />
    )
  } else if (page === 'recipe' && sub === 'edit') {
    title = `Edit ${recipesById[param]?.name ?? 'recipe'}`
    content = (
      <RecipePage
        key={param}
        recipe={recipesById[param]}
        knownItems={knownItems}
        allTags={[...new Set(recipes.flatMap((r) => r.tags ?? []))].sort()}
        actions={actions}
      />
    )
  } else if (page === 'recipe') {
    title = recipesById[param]?.name ?? 'Recipe not found'
    content = <RecipeView key={param} recipe={recipesById[param]} plan={plan} actions={actions} />
  } else if (page === 'plan') {
    title = 'Meal plan'
    content = <PlanPage plan={plan} week={week} recipes={recipes} recipesById={recipesById} actions={actions} />
  } else if (page === 'grocery') {
    title = 'Grocery list'
    content = <GroceryPage plan={plan} week={week} recipesById={recipesById} registry={registry} actions={actions} />
  } else if (page === 'ingredients') {
    title = 'Ingredients'
    content = <IngredientsPage recipes={recipes} registry={registry} focus={param} actions={actions} />
  } else {
    title = 'Recipes'
    content = <Library recipes={recipes} plan={plan} registry={registry} query={query} actions={actions} />
  }

  useEffect(() => {
    document.title = title ? `${title} · Food Dashboard` : 'Food Dashboard'
  }, [title])

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Food Dashboard</span>
        <nav>
          {NAV.map(([path, label]) => (
            <a key={path} href={`#/${path}`} className={section === path ? 'active' : ''} aria-current={section === path ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted small save-state" aria-live="polite">
          {pending > 0 ? 'Saving…' : ''}
        </span>
      </header>
      <main>{content}</main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            {t.link && (
              <a href={t.link.href} onClick={() => dismiss(t.id)}>
                {t.link.label}
              </a>
            )}
            {t.undo && (
              <button
                className="link"
                onClick={() => {
                  dismiss(t.id)
                  t.undo()
                }}
              >
                Undo
              </button>
            )}
            <button className="link toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
