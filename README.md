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
| `recipes/<id>.json` | One file per recipe. Each ingredient keeps the imported `original` next to your `modified` version, plus free-text `notes`. |
| `data/plan.json` | The current meal plan: recipe, day, and scale factor. |
| `data/pantry.json` | Pantry staples. These show in a separate "check before buying" section of the grocery list. |

**Scaling** multiplies a recipe's ingredient amounts (1.5 = 1.5× everything); it ignores the recipe's stated servings.

**Grocery list** groups items by name. Amounts with the same unit are added together, and other units are listed alongside (`garlic: 1 + 8 clove`). There's no unit conversion yet.

## Adding recipes

Ask Claude to import a recipe from a link or an image. The `import-recipe` skill (`.claude/skills/import-recipe/`) writes a new `recipes/<id>.json` and applies any notes you give it.
