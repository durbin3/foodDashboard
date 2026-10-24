import { useState } from 'react'
import { buildGroceryList, groceryListText } from '../lib/grocery.js'

export default function GroceryPage({ plan, recipesById, pantry, actions }) {
  const [copied, setCopied] = useState(false)
  const list = buildGroceryList(plan, recipesById, pantry.staples)

  async function copy() {
    await navigator.clipboard.writeText(groceryListText(list))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function toggleStaple(name, makeStaple) {
    const staples = makeStaple
      ? [...pantry.staples, name].sort()
      : pantry.staples.filter((s) => s.trim().toLowerCase() !== name)
    actions.savePantry({ ...pantry, staples })
  }

  if (!plan.entries.length) return <p className="muted">Add meals to the plan to build a grocery list.</p>

  const section = (title, lines, staple) => (
    <div className="grocery-section">
      <h2>{title}</h2>
      {lines.length === 0 && <p className="muted small">Nothing here.</p>}
      <ul className="grocery">
        {lines.map((l) => (
          <li key={l.name}>
            <span className="g-name">{l.name}</span>
            <span className="g-amount">{l.amount}</span>
            <span className="muted small g-sources">{l.sources.join(', ')}</span>
            <button className="link small" onClick={() => toggleStaple(l.name, !staple)}>
              {staple ? 'Not a staple' : 'Mark as staple'}
            </button>
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
