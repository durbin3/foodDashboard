# foodDashboard

A local dashboard for the meals I know how to make: a recipe library, a weekly meal plan, and a combined grocery list.

## Running

```sh
npm install
npm run dev
```

It opens at http://localhost:5173. Every edit in the UI is written straight to JSON files in the repo, so changes survive a refresh and can be committed.

## Data

| Path | What it holds |
| --- | --- |
| `recipes/<id>.json` | One file per recipe. Each ingredient keeps the imported `original` next to your `modified` version, plus free-text `notes`. Ingredients are referenced by `ingredientId`. |
| `data/ingredients.json` | The ingredient registry: every known ingredient by id, with its display name, `staple` flag (pantry section on the grocery list), "buy as" unit, and per-ingredient conversions. Also the shared custom conversions. |
| `data/plan.json` | The current meal plan: recipe, day, and scale factor. |

Renaming an ingredient only changes its `name` in the registry; recipes keep pointing at the same id. Merging two ingredients is the one operation that rewrites recipe files.

**Scaling** multiplies a recipe's ingredient amounts (1.5 = 1.5× everything); it ignores the recipe's stated servings.

**Grocery list** groups items by name and converts units where it can. It uses the built-in conversions (tsp/tbsp/cup, oz/lb, metric) plus any you add on the Ingredients tab (e.g. 1 each chicken breast = 1/2 lb). Amounts that still can't be converted are listed side by side (`garlic: 1 + 8 clove`).

## Adding recipes

Ask Claude to import a recipe from a link or an image. The `import-recipe` skill (`.claude/skills/import-recipe/`) writes a new `recipes/<id>.json` and applies any notes you give it.
