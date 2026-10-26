# foodDashboard

A local dashboard for the meals I know how to make: a recipe library, a weekly meal plan, and a combined grocery list.

## Running

```sh
npm install
npm run dev
```

It opens at http://127.0.0.1:5173 (use that address rather than localhost; see the note in `vite.config.js`). Every edit in the UI is written straight to JSON files in the repo, so changes survive a refresh and can be committed.

## Data

| Path | What it holds |
| --- | --- |
| `recipes/<id>.json` | One file per recipe. Each ingredient keeps the imported `original` next to your `modified` version, plus free-text `notes`. Ingredients are referenced by `ingredientId`. |
| `data/ingredients.json` | The ingredient registry: every known ingredient by id, with its display name, `staple` flag (pantry section on the grocery list), `notListed` flag (left off the grocery list, e.g. "taco toppings"), "buy as" unit, and its unit conversions. |
| `data/plan.json` | The meal plan: recipe, `date` (`YYYY-MM-DD`, or `null` for unscheduled), and scale factor. Past entries stay as history and feed the library's "Last made" column. Older files with weekday names are read as the current week. |

Renaming an ingredient only changes its `name` in the registry; recipes keep pointing at the same id. Merging two ingredients is the one operation that rewrites recipe files.

**Scaling** multiplies a recipe's ingredient amounts (1.5 = 1.5× everything); it ignores the recipe's stated servings.

**Meal plan** shows one week at a time. Unscheduled meals appear in every week and count toward every week's grocery list until you give them a day.

**Grocery list** is built per week (that week's meals plus unscheduled ones). Ticks are kept in your browser only, per week, and a tick clears itself if the amount changes. It groups items by ingredient and converts units using each ingredient's own conversion list. Standard conversions (tsp/tbsp/cup, oz/lb, metric, pinch) are added to an ingredient automatically once recipes use it in more than one unit; anything else (e.g. 1 each chicken breast = 1/2 lb) you add on the Ingredients tab, where unconvertible ingredients are flagged "needs conversion". Amounts that still can't be converted are listed side by side (`garlic: 1 + 8 clove`).

## Adding recipes

Ask Claude to import a recipe from a link or an image. The `import-recipe` skill (`.claude/skills/import-recipe/`) writes a new `recipes/<id>.json` and applies any notes you give it.
