import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { newRecipe, withNames } from './lib/recipe.js'
import Library from './pages/Library.jsx'
import RecipePage from './pages/RecipePage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import GroceryPage from './pages/GroceryPage.jsx'
import IngredientsPage from './pages/IngredientsPage.jsx'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
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
  const [plan, setPlan] = useState({ entries: [] })
  const [registry, setRegistry] = useState({ ingredients: {} })
  const [error, setError] = useState(null)
  const [page, param] = useHashRoute()

  function loadAll() {
    return Promise.all([api.listRecipes(), api.getPlan(), api.getIngredients()])
      .then(([r, p, i]) => {
        setStoredRecipes(r)
        setPlan(p)
        setRegistry(i)
      })
      .catch((err) => setError(err.message))
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

  function run(promise) {
    return promise.catch((err) => {
      setError(err.message)
      throw err
    })
  }

  // Recipe saves return the stored recipe plus the registry (which gains entries for new ingredient names).
  function applySaved({ recipe, ingredients }) {
    setRegistry(ingredients)
    setStoredRecipes((rs) => [...rs.filter((r) => r.id !== recipe.id), recipe].sort(byName))
    return recipe
  }

  const actions = {
    createRecipe: (recipe) => run(api.createRecipe(recipe)).then(applySaved),
    saveRecipe: (recipe) => run(api.saveRecipe(recipe)).then(applySaved),
    deleteRecipe: async (id) => {
      await run(api.deleteRecipe(id))
      setStoredRecipes((rs) => rs.filter((r) => r.id !== id))
      if (plan.entries.some((e) => e.recipeId === id)) {
        await actions.savePlan({ ...plan, entries: plan.entries.filter((e) => e.recipeId !== id) })
      }
    },
    savePlan: (next) => {
      setPlan(next)
      return run(api.savePlan(next))
    },
    addToPlan: (recipeId, day = '', scale = 1) => {
      const entry = { id: crypto.randomUUID(), recipeId, day, scale }
      return actions.savePlan({ ...plan, entries: [...plan.entries, entry] })
    },
    saveRegistry: (next) => {
      setRegistry(next)
      return run(api.saveIngredients(next))
    },
    /** Patch one ingredient's settings; undefined values are dropped when saved. */
    updateIngredient: (id, patch) =>
      actions.saveRegistry({
        ...registry,
        ingredients: { ...registry.ingredients, [id]: { ...registry.ingredients[id], ...patch } },
      }),
    deleteIngredient: (id) => {
      const { [id]: _, ...ingredients } = registry.ingredients
      return actions.saveRegistry({ ...registry, ingredients })
    },
    mergeIngredient: (from, into) => run(api.mergeIngredient(from, into)).then(loadAll),
  }

  let content
  if (!recipes) content = <p className="muted">Loading…</p>
  else if (page === 'new')
    content = (
      <RecipePage
        key="new"
        recipe={blankRecipe}
        isNew
        takenIds={new Set(recipes.map((r) => r.id))}
        knownItems={knownItems}
        actions={actions}
      />
    )
  else if (page === 'recipe')
    content = <RecipePage key={param} recipe={recipesById[param]} knownItems={knownItems} actions={actions} />
  else if (page === 'plan') content = <PlanPage plan={plan} recipes={recipes} recipesById={recipesById} actions={actions} />
  else if (page === 'grocery')
    content = <GroceryPage plan={plan} recipesById={recipesById} registry={registry} actions={actions} />
  else if (page === 'ingredients')
    content = <IngredientsPage recipes={recipes} registry={registry} focus={param} actions={actions} />
  else content = <Library recipes={recipes} plan={plan} registry={registry} actions={actions} />

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Food Dashboard</span>
        <nav>
          {NAV.map(([path, label]) => (
            <a key={path} href={`#/${path}`} className={(page || '') === path ? 'active' : ''}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      {error && (
        <div className="error" onClick={() => setError(null)}>
          {error} <span className="muted">(click to dismiss)</span>
        </div>
      )}
      <main>{content}</main>
    </div>
  )
}
