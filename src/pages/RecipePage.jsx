import { useEffect, useState } from 'react'
import { formatIngredient } from '../lib/quantity.js'
import { effectiveIngredient, sameIngredient } from '../lib/recipe.js'

const FIELDS = [
  ['quantity', 'Qty', 'qty'],
  ['unit', 'Unit', 'unit'],
  ['item', 'Item', 'item'],
  ['note', 'Note', 'note'],
]

export default function RecipePage({ recipe, actions }) {
  const [draft, setDraft] = useState(recipe)
  const [tagText, setTagText] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    setDraft(recipe)
    setTagText((recipe?.tags ?? []).join(', '))
  }, [recipe])

  if (!recipe) return <p className="muted">Recipe not found.</p>

  const dirty = JSON.stringify(draft) !== JSON.stringify(recipe)
  const groups = [...new Set(draft.ingredients.map((i) => i.group ?? ''))]

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const updateIngredient = (id, fn) =>
    update({ ingredients: draft.ingredients.map((i) => (i.id === id ? fn(i) : i)) })

  function setField(ing, field, value) {
    updateIngredient(ing.id, (i) => {
      const next = { ...effectiveIngredient(i), [field]: value }
      const unchanged = i.original && sameIngredient(next, i.original)
      return { ...i, modified: unchanged ? null : next }
    })
  }

  function addIngredient(group) {
    const blank = { quantity: '', unit: '', item: '', note: '' }
    const ing = { id: `custom-${Date.now().toString(36)}`, group, original: null, modified: blank }
    update({ ingredients: [...draft.ingredients, ing] })
  }

  async function save() {
    setStatus('Saving…')
    try {
      await actions.saveRecipe(draft)
      setStatus('Saved')
    } catch {
      setStatus('')
    }
  }

  return (
    <section className="recipe">
      <div className="recipe-head">
        <h1>{draft.name}</h1>
        <div className="save-bar">
          {status && !dirty && <span className="muted small">{status}</span>}
          {dirty && <button onClick={() => setDraft(recipe)}>Discard</button>}
          <button className="primary" disabled={!dirty} onClick={save}>
            Save changes
          </button>
        </div>
      </div>
      <div className="muted small meta">
        {draft.source && (
          <a href={draft.source} target="_blank" rel="noreferrer">
            Source
          </a>
        )}
        {draft.servings && <span>Recipe says {draft.servings} servings</span>}
        <button onClick={() => actions.addToPlan(draft.id)}>+ Add to plan</button>
      </div>

      <label className="field">
        Tags <span className="muted small">(comma separated)</span>
        <input
          value={tagText}
          onChange={(e) => {
            setTagText(e.target.value)
            update({ tags: e.target.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) })
          }}
        />
      </label>

      <h2>Ingredients</h2>
      <p className="muted small">
        Edit the right-hand fields to make your version. The imported original stays on the left.
      </p>
      {groups.map((group) => (
        <div key={group} className="ing-group">
          {group && <h3>{group}</h3>}
          <table className="ing-table">
            <thead>
              <tr>
                <th>Original</th>
                {FIELDS.map(([, label, cls]) => (
                  <th key={label} className={cls}>
                    {label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.ingredients
                .filter((i) => (i.group ?? '') === group)
                .map((ing) => {
                  const eff = effectiveIngredient(ing)
                  const changed = !!ing.modified && !!ing.original
                  return (
                    <tr key={ing.id} className={ing.removed ? 'removed' : changed ? 'changed' : !ing.original ? 'added' : ''}>
                      <td className="original">
                        {ing.original ? (
                          <span className={changed || ing.removed ? 'struck' : ''}>{formatIngredient(ing.original)}</span>
                        ) : (
                          <em className="muted">added by you</em>
                        )}
                      </td>
                      {FIELDS.map(([field, , cls]) => (
                        <td key={field} className={cls}>
                          <input
                            value={eff[field] ?? ''}
                            disabled={ing.removed}
                            onChange={(e) => setField(ing, field, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="row-actions">
                        {changed && (
                          <button title="Revert to original" onClick={() => updateIngredient(ing.id, (i) => ({ ...i, modified: null }))}>
                            Reset
                          </button>
                        )}
                        {!ing.original ? (
                          <button title="Delete" onClick={() => update({ ingredients: draft.ingredients.filter((i) => i.id !== ing.id) })}>
                            Delete
                          </button>
                        ) : ing.removed ? (
                          <button onClick={() => updateIngredient(ing.id, ({ removed, ...i }) => i)}>Restore</button>
                        ) : (
                          <button title="Leave out of your version" onClick={() => updateIngredient(ing.id, (i) => ({ ...i, removed: true }))}>
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
          <button className="link" onClick={() => addIngredient(group)}>
            + Add ingredient{group && ` to ${group}`}
          </button>
        </div>
      ))}

      <h2>Notes</h2>
      <textarea
        rows={6}
        value={draft.notes ?? ''}
        placeholder="Your notes on this recipe…"
        onChange={(e) => update({ notes: e.target.value })}
      />

      {draft.steps?.length > 0 && (
        <>
          <h2>Steps</h2>
          <ol className="steps">
            {draft.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
