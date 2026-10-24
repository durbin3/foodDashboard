import { useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import Library from './pages/Library.jsx'
import RecipePage from './pages/RecipePage.jsx'
import PlanPage from './pages/PlanPage.jsx'
import GroceryPage from './pages/GroceryPage.jsx'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash.replace(/^#\/?/, '').split('/')
}

const NAV = [
  ['', 'Recipes'],
  ['plan', 'Meal plan'],
  ['grocery', 'Grocery list'],
]

export default function App() {
  const [recipes, setRecipes] = useState(null)
  const [plan, setPlan] = useState({ entries: [] })
  const [pantry, setPantry] = useState({ staples: [] })
  const [error, setError] = useState(null)
  const [page, param] = useHashRoute()

  useEffect(() => {
    Promise.all([api.listRecipes(), api.getPlan(), api.getPantry()])
      .then(([r, p, s]) => {
        setRecipes(r)
        setPlan(p)
        setPantry(s)
      })
      .catch((err) => setError(err.message))
  }, [])

  const recipesById = useMemo(
    () => Object.fromEntries((recipes ?? []).map((r) => [r.id, r])),
    [recipes],
  )

  function run(promise) {
    return promise.catch((err) => {
      setError(err.message)
      throw err
    })
  }

  const actions = {
    saveRecipe: (recipe) =>
      run(api.saveRecipe(recipe)).then((saved) =>
        setRecipes((rs) => rs.map((r) => (r.id === saved.id ? saved : r))),
      ),
    savePlan: (next) => {
      setPlan(next)
      return run(api.savePlan(next))
    },
    addToPlan: (recipeId, day = '', scale = 1) => {
      const entry = { id: crypto.randomUUID(), recipeId, day, scale }
      return actions.savePlan({ ...plan, entries: [...plan.entries, entry] })
    },
    savePantry: (next) => {
      setPantry(next)
      return run(api.savePantry(next))
    },
  }

  let content
  if (!recipes) content = <p className="muted">Loading…</p>
  else if (page === 'recipe') content = <RecipePage recipe={recipesById[param]} actions={actions} />
  else if (page === 'plan') content = <PlanPage plan={plan} recipes={recipes} recipesById={recipesById} actions={actions} />
  else if (page === 'grocery')
    content = <GroceryPage plan={plan} recipesById={recipesById} pantry={pantry} actions={actions} />
  else content = <Library recipes={recipes} plan={plan} actions={actions} />

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
