import { useEffect, useState } from 'react'
import { formatQuantity } from '../lib/quantity.js'
import { realServings, SERVINGS_PER_DINNER } from '../lib/meals.js'

/**
 * A recipe's real servings, edited in place and saved straight to the recipe.
 * The stated servings are usually off, so this is the quick way to correct
 * them after cooking it.
 */
export default function ServingsEditor({ recipe, actions }) {
  const batch = realServings(recipe)
  const dinners = batch ? Math.max(1, Math.floor(batch / SERVINGS_PER_DINNER + 1e-9)) : null
  return (
    <span className="servings-editor small">
      <label title="How many servings a batch really makes, at the portions you eat">
        Makes{' '}
        <NumberField
          value={recipe.trueServings ?? null}
          placeholder={recipe.servings ? String(recipe.servings) : '?'}
          label={`Real servings of ${recipe.name}`}
          onCommit={(n) => actions.patchRecipe(recipe.id, { trueServings: n })}
        />{' '}
        servings
      </label>
      {recipe.servings != null && recipe.trueServings != null && recipe.trueServings !== recipe.servings && (
        <span className="muted"> (recipe says {formatQuantity(recipe.servings)})</span>
      )}
      {recipe.trueServings == null && <span className="muted"> {recipe.servings ? '(recipe’s count)' : ''}</span>}
      {dinners != null && (
        <span className="muted">
          {' '}
          = {dinners} dinner{dinners === 1 ? '' : 's'} at {SERVINGS_PER_DINNER} servings each
        </span>
      )}
    </span>
  )
}

/** A small number box that saves on blur or Enter; blank saves null. */
function NumberField({ value, placeholder, label, onCommit }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = () => {
    const trimmed = text.trim()
    const n = trimmed === '' ? null : Number(trimmed)
    if (n === null || n > 0) n !== value && onCommit(n)
    else setText(value == null ? '' : String(value))
  }
  return (
    <input
      className="servings-input"
      type="number"
      min="0.5"
      step="0.5"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
