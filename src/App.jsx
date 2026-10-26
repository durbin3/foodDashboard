import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import { cycleStart, formatCycle, normalizePlan } from './lib/plan.js'
import { categoryOf, newRecipe, withNames } from './lib/recipe.js'
import { DEFAULT_SETTINGS, normalizeSettings } from './lib/settings.js'
import Library from './pages/Library.jsx'
import RecipeView from './pages/RecipeView.jsx'
import RecipePage from './pages/RecipePage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import GroceryPage from './pages/GroceryPage.jsx'
import IngredientsPage from './pages/IngredientsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import StoragePage from './pages/StoragePage.jsx'

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
  ['storage', 'On hand'],
  ['ingredients', 'Ingredients'],
  ['settings', 'Settings'],
]

const byName = (a, b) => a.name.localeCompare(b.name)

export default function App() {
  const [storedRecipes, setStoredRecipes] = useState(null)
  const [toasts, setToasts] = useState([])
  const [pending, setPending] = useState(0)
  const onSaving = (d) => setPending((n) => n + d)
  const [storedPlan, updatePlan, replacePlan] = usePersisted({ meals: [] }, (p) => run(api.savePlan(p)), onSaving)
  const [registry, updateRegistry, replaceRegistry, latestRegistry] = usePersisted(
    { ingredients: {} },
    (r) => run(api.saveIngredients(r)),
    onSaving,
  )
  const [settings, updateSettings, replaceSettings] = usePersisted(DEFAULT_SETTINGS, (s) => run(api.saveSettings(s)), onSaving)
  const [inventory, updateInventory, replaceInventory, latestInventory] = usePersisted({ items: [] }, (i) => run(api.saveInventory(i)), onSaving)
  const leaveGuard = useRef(null)
  const { parts, query } = useHashRoute(leaveGuard)
  const [page, param, sub] = parts
  // Recipe pages belong under the Recipes tab.
  const section = page === 'new' || page === 'recipe' ? '' : page || ''
  // The shopping cycle the plan and grocery pages show; remembered across tabs.
  const anchor = settings.cycleStart
  const [cycle, setCycle] = useState(() => cycleStart(anchor))
  useEffect(() => {
    setCycle((c) => cycleStart(anchor, (page === 'plan' || page === 'grocery') && param ? param : c))
  }, [page, param, anchor])
  const plan = useMemo(() => normalizePlan(storedPlan, anchor), [storedPlan, anchor])

  function loadAll() {
    return Promise.all([api.listRecipes(), api.getPlan(), api.getIngredients(), api.getSettings(), api.getInventory()])
      .then(([r, p, i, s, inv]) => {
        replaceInventory({ items: [], ...inv })
        setStoredRecipes(r)
        const loaded = normalizeSettings(s)
        replaceSettings(loaded)
        replacePlan(normalizePlan(p, loaded.cycleStart))
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
  const removeMeals = (ids) => updatePlan((p) => ({ ...p, meals: p.meals.filter((m) => !ids.includes(m.id)) }))
  const restoreMeals = (meals) => updatePlan((p) => ({ ...p, meals: [...p.meals, ...meals] }))

  const actions = {
    notify,
    setLeaveGuard: (fn) => (leaveGuard.current = fn),
    createRecipe: (recipe) => run(api.createRecipe(recipe)).then(applySaved),
    saveRecipe: (recipe) => run(api.saveRecipe(recipe)).then(applySaved),
    deleteRecipe: async (id) => {
      await run(api.deleteRecipe(id))
      setStoredRecipes((rs) => rs.filter((r) => r.id !== id))
      // Meals of a deleted main go; a deleted side just comes off the meals it was attached to.
      await updatePlan((p) => ({
        ...p,
        meals: p.meals
          .filter((m) => m.recipeId !== id)
          .map((m) => (m.sides?.some((s) => s.recipeId === id) ? { ...m, sides: m.sides.filter((s) => s.recipeId !== id) } : m)),
      }))
    },
    /** Adds a meal to the cycle being planned (the one last shown on the plan page), not on a day yet. Returns its id. */
    addToPlan: (recipeId, scale = 1, { quiet = false } = {}) => {
      const meal = { id: crypto.randomUUID(), recipeId, cycle, date: null, scale }
      if (!quiet)
        notify(`Added ${recipeName(recipeId)} to the ${formatCycle(cycle)} plan.`, {
          undo: () => removeMeals([meal.id]),
          link: page === 'plan' ? null : { href: `#/plan/${cycle}`, label: 'Pick a day' },
        })
      updatePlan((p) => ({ ...p, meals: [...p.meals, meal] }))
      return meal.id
    },
    /** Adds several recipes to the cycle being planned in one change, with one Undo. */
    addMeals: (recipeIds) => {
      const meals = recipeIds.map((recipeId) => ({ id: crypto.randomUUID(), recipeId, cycle, date: null, scale: 1 }))
      notify(`Added ${meals.length} meal${meals.length === 1 ? '' : 's'}: ${recipeIds.map(recipeName).join(', ')}.`, {
        undo: () => removeMeals(meals.map((m) => m.id)),
      })
      return updatePlan((p) => ({ ...p, meals: [...p.meals, ...meals] }))
    },
    /** Put several meals on days at once: { mealId: date }. */
    placeMeals: (dates) => updatePlan((p) => ({ ...p, meals: p.meals.map((m) => (m.id in dates ? { ...m, date: dates[m.id] } : m)) })),
    setRecommendation: (cycleStart, rec) => updatePlan((p) => ({ ...p, recommendations: { ...p.recommendations, [cycleStart]: rec } })),
    updateMeal: (id, patch) => updatePlan((p) => ({ ...p, meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    removeMeal: (meal) => {
      notify(`Removed ${recipeName(meal.recipeId)} from the plan.`, { undo: () => restoreMeals([meal]) })
      return removeMeals([meal.id])
    },
    clearMeals: (meals) => {
      notify(`Cleared ${meals.length} meal${meals.length === 1 ? '' : 's'}.`, { undo: () => restoreMeals(meals) })
      return removeMeals(meals.map((m) => m.id))
    },
    updateSettings,
    updateInventory,
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
      const inventoryBefore = latestInventory.current
      const touched = storedRecipes.filter((r) =>
        r.ingredients.some((i) => i.original?.ingredientId === from || i.modified?.ingredientId === from),
      )
      await run(api.mergeIngredient(from, into))
      await loadAll()
      notify(`Merged "${before.ingredients[from]?.name}" into "${before.ingredients[into]?.name}" (${touched.length} recipe${touched.length === 1 ? '' : 's'} updated).`, {
        undo: async () => {
          await run(api.saveIngredients(before))
          await run(api.saveInventory(inventoryBefore))
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
        registry={registry}
        allTags={[...new Set(recipes.flatMap((r) => r.tags ?? []))].sort()}
        sides={recipes.filter((r) => categoryOf(r) === 'side')}
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
        registry={registry}
        allTags={[...new Set(recipes.flatMap((r) => r.tags ?? []))].sort()}
        sides={recipes.filter((r) => categoryOf(r) === 'side')}
        actions={actions}
      />
    )
  } else if (page === 'recipe') {
    title = recipesById[param]?.name ?? 'Recipe not found'
    content = <RecipeView key={param} recipe={recipesById[param]} recipes={recipes} recipesById={recipesById} plan={plan} actions={actions} />
  } else if (page === 'plan') {
    title = 'Meal plan'
    content = <PlanPage plan={plan} cycle={cycle} settings={settings} recipes={recipes} recipesById={recipesById} registry={registry} inventory={inventory} actions={actions} />
  } else if (page === 'grocery') {
    title = 'Grocery list'
    content = (
      <GroceryPage plan={plan} cycle={cycle} settings={settings} recipesById={recipesById} registry={registry} inventory={inventory} actions={actions} />
    )
  } else if (page === 'ingredients') {
    title = 'Ingredients'
    content = <IngredientsPage recipes={recipes} registry={registry} focus={param} actions={actions} />
  } else if (page === 'storage') {
    title = 'On hand'
    content = <StoragePage inventory={inventory} registry={registry} actions={actions} />
  } else if (page === 'settings') {
    title = 'Settings'
    content = <SettingsPage settings={settings} actions={actions} />
  } else {
    title = 'Recipes'
    content = <Library recipes={recipes} plan={plan} anchor={anchor} registry={registry} query={query} actions={actions} />
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
