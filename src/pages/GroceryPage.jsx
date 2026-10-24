import { useState } from 'react'
import { buildGroceryList, groceryListText } from '../lib/grocery.js'

export default function GroceryPage({ plan, recipesById, registry, actions }) {
  const [copied, setCopied] = useState(false)
  const list = buildGroceryList(plan, recipesById, registry)

  async function copy() {
    await navigator.clipboard.writeText(groceryListText(list))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!plan.entries.length) return <p className="muted">Add meals to the plan to build a grocery list.</p>

  const section = (title, lines, staple) => (
    <div className="grocery-section">
      <h2>{title}</h2>
      {lines.length === 0 && <p className="muted small">Nothing here.</p>}
      <ul className="grocery">
        {lines.map((l) => (
          <li key={l.id}>
            <a className="g-name" href={`#/ingredients/${encodeURIComponent(l.id)}`} title="Ingredient settings">
              {l.name}
            </a>
            <span className="g-amount">
              {l.amount}
              {l.unconverted && (
                <a className="small add-conv" href={`#/ingredients/${encodeURIComponent(l.id)}`}>
                  add conversion
                </a>
              )}
            </span>
            <span className="muted small g-sources">{l.sources.join(', ')}</span>
            {registry.ingredients[l.id] && (
              <button className="link small" onClick={() => actions.updateIngredient(l.id, { staple: !staple || undefined })}>
                {staple ? 'Not a staple' : 'Mark as staple'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <section>
      <div className="toolbar">
        <button className="primary" onClick={copy}>
          {copied ? 'Copied!' : 'Copy as text'}
        </button>
      </div>
      {section('Groceries', list.groceries, false)}
      {section('Pantry — check before buying', list.pantry, true)}
    </section>
  )
}
