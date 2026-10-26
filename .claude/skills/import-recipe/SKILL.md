---
name: import-recipe
description: Import a recipe from a URL or an image (photo/screenshot of a recipe) into this Food Dashboard as recipes/<id>.json. Use when the user gives a recipe link or image and wants it added to their known meals, optionally with their own notes or tweaks.
---

# Import a recipe

Turn a recipe URL or image into a file in `recipes/` that the dashboard can display, edit, and add to grocery lists.

## 1. Get the recipe content

**From a URL**, try these in order and stop at the first that works:

1. `WebFetch` the URL and ask for the title, servings, ingredient lines verbatim (with group headings like "Sauce"), and the steps verbatim.
2. Many recipe sites block WebFetch (HTTP 403). Download the page with curl into a fresh scratchpad folder, then run the extractor:
   ```sh
   curl -sL -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" -o <scratch>/page.html "<url>"
   node .claude/skills/import-recipe/extract-recipe.mjs <scratch>/page.html
   ```
3. If that still returns 403, use the Wayback Machine raw copy (the `id_` suffix returns the original HTML; it may be gzipped, and the extractor handles that):
   ```sh
   curl -sL -o <scratch>/page.html "https://web.archive.org/web/2025id_/<url>"
   ```
   Print links such as `https://site.com/wprm_print/<slug>` usually aren't archived. For those, try the archived regular recipe page. Don't guess its URL from the print slug: sites often use a different slug (e.g. `wprm_print/freezer-steak-burritos` belongs to `/freezer-friendly-steak-burritos/`). If you downloaded the print page itself, the extractor's `recipePageUrl` gives the real one.
4. If nothing works, ask the user to paste the recipe text or send a screenshot.

The extractor reads standard schema.org recipe data when the page has it, and otherwise reads the WP Recipe Maker HTML. WPRM print pages have no schema data, so they always take the HTML route. Its output:

- `from`: `json-ld` or `wprm-html`, showing which source was used.
- `name`, `yield`, `ingredients` (full lines), `steps`.
- `prepMinutes`, `cookMinutes`: the stated times in minutes, or `null` when the page doesn't give them.
- `ingredientParts`: each ingredient already split into `amount` / `unit` / `name` / `notes`, with its `group`. Start from these when normalizing, but still apply the rules below. WPRM sometimes puts a size word in `unit` (e.g. `"large"` for tortillas), and on some sites `notes` holds the price.
- `ingredientGroups`: group name and count, in order.
- `recipeNotes`: footnotes, e.g. what `*` on an ingredient means.
- `recipePageUrl`: the full recipe page. Use it as `source` instead of a print URL.

**From an image**, `Read` the image file and transcribe the title, servings, ingredients (with any group headings), and steps.

**From a PDF** (often a recipe page saved with "Print → Save as PDF"):

1. Extract the text with layout preserved, writing to a scratchpad file:
   ```sh
   pdftotext -layout "<file>.pdf" <scratch>/recipe.txt
   ```
   `pdftotext` ships with Git for Windows (Git Bash). If it isn't available, skip to step 2.
2. If the text comes out empty or garbled (a scanned or photographed PDF), or `pdftotext` is missing, `Read` the PDF directly with the `pages` parameter (e.g. `"1-3"`). That renders the pages as images, and you transcribe them the same way as an image.
3. Things to watch for in PDFs saved from recipe sites:
   - **Footnote markers:** `*`, `**` and so on after an ingredient. Their meanings are usually in a "Notes" section after the instructions. Fold the relevant part into the ingredient's `note`.
   - **Repeated ingredients:** WPRM pages repeat the ingredients inline at the end of each step (e.g. "…set aside. 1 cup warm milk, 2 1/2 teaspoons yeast"). Drop those trailing lists from the steps.
   - **Broken characters:** `�` usually stands for `°`. Fix obvious cases ("115°F").
   - **Page clutter:** page headers, footers and URLs can land between lines. Drop them.
   - **Source link:** the original URL is often printed in a header or footer. Use it as `source`.

For images and PDFs, set `source` to the original web URL if one is visible. If only part of the URL or a site name shows (e.g. a cut-off address bar), search the web for the recipe. A match is only valid if its ingredients agree with the image exactly; then use its URL, and fill any steps or servings the image is missing from that page. If you can't find a confirmed match, set `source` to `""`. Never use the input file's path, because input files are deleted after import.

## 2. Build the recipe file

Write `recipes/<id>.json`, where `id` is the kebab-case recipe name. If that file already exists, stop and ask before overwriting it.

Write each ingredient with an `item` **name**, as below. Stored recipes refer to ingredients by id from the registry `data/ingredients.json`, and step 3b converts the names to ids.

```json
{
  "id": "honey-garlic-chicken",
  "name": "Honey Garlic Chicken",
  "source": "https://…",
  "servings": 4,
  "category": "main",
  "effort": 2,
  "prepMinutes": 15,
  "cookMinutes": 20,
  "tags": ["chicken", "quick"],
  "ingredients": [
    {
      "id": "garlic",
      "group": "Chicken",
      "original": { "quantity": "4", "unit": "clove", "item": "garlic", "note": "minced" },
      "modified": null
    }
  ],
  "steps": ["…"],
  "notes": ""
}
```

Ingredient rules. These matter because the grocery list combines ingredients by exact `item` name and `unit`.

**Before naming items, list the names in the ingredient registry** and reuse one whenever it's the same thing you'd buy:

```sh
node -e "const r=require('./data/ingredients.json');console.log(Object.values(r.ingredients).map(i=>i.name).sort().join('\n'))"
```

For example, "milk" becomes `whole milk`, "pepper" becomes `black pepper`, "oregano" becomes `dried oregano`, "grated parmesan" becomes `parmesan cheese` with note "grated", and "all-purpose flour" becomes `flour`. Keep a different name only when it's a different purchase: `kosher salt`, `salted butter`, `bread flour`.

- **quantity**: a string. Use fractions as written: `"1/3"`, `"1 1/2"`, `"2"`. For a range ("1-2"), use the larger number. Use `""` for "to taste" or for no amount, and put the wording in `note`.
- **unit**: lowercase and singular, from this set where possible: `tsp`, `tbsp`, `cup`, `lb`, `oz`, `g`, `clove`, `can`, `pinch`. Use `""` for counted items (2 chicken breasts, 1 onion).
- **item**: the canonical grocery name, lowercase and singular, with no prep or size words: `"chicken breast"`, `"green onion"`, `"garlic"`, `"yellow onion"`. Keep words that change what you'd buy ("toasted sesame oil", "low-sodium soy sauce").
- **note**: prep and descriptors: `"minced"`, `"boneless, skinless"`, `"divided"`, `"to taste"`.
- Strip prices such as `($1.08)`.
- **id**: kebab-case from the item, unique within the recipe.
- **group**: the heading the ingredient sits under ("Sauce"), or `""` if the recipe has no groups.
- **tags**: 2–4 lowercase tags (main protein, cuisine, method, "quick" for about 30 minutes or less). Reuse tags already used in other `recipes/*.json` files where they fit.
- **servings**: a number if the recipe states one; otherwise `null`.
- **category**: `main`, `side`, `breakfast`, `dessert` or `drink`. Sauces and condiments that go with something (salsa, gravy over biscuits) take the category of what they're served with or `side`.
- **prepMinutes** / **cookMinutes**: whole minutes from the recipe's stated prep and cook times (schema.org `prepTime`/`cookTime`, e.g. `PT15M`). Fold "inactive" or "chill" time into `cookMinutes`. Use `null` when the recipe doesn't say.
- **effort**: 1–5, where 1 is dump-and-go (a slow cooker recipe with no browning), 2 easy, 3 some work (a couple of pans, some chopping), 4 involved (many steps or components), 5 a project (dough, layering, an afternoon). Base it on hands-on work and the number of steps, not total time. Say in the report what you chose so the user can correct it.

## 3. Apply the user's notes and tweaks

- Put the user's notes **verbatim** into `notes`, with lines separated by `\n`.
- When a note changes an amount or ingredient, keep `original` as imported and set `modified` to the user's version, a full `{quantity, unit, item, note}` object. Don't change `original`.
  - "1.5x sauce" means: multiply every ingredient in the Sauce group by 1.5 in `modified`, unless another note gives an explicit amount for that ingredient (the explicit amount wins).
  - If a tweak works out to the same amount as the original, leave `modified` as `null`.
- To remove an ingredient, add `"removed": true`. For an ingredient the user adds, set `"original": null` and put it in `modified`.
- If a note is ambiguous, ask before encoding it as a modification. It's always safe to keep it in `notes`.

## 3b. Link ingredients to the registry

From the project root, run:

```sh
node .claude/skills/import-recipe/link-ingredients.mjs recipes/<id>.json
```

The script replaces each `item` with an `ingredientId` and adds any new names to `data/ingredients.json`. An item links to an existing ingredient when it matches the ingredient's name, one of its `aliases`, or the same words once plurals and prep/size words are set aside ("Boneless Skinless Chicken Breasts" → `chicken breast`). Words that change the purchase (fresh, dried, ground, shredded) still have to match.

It prints which ingredients matched and which were created, and for each created one, existing ingredients it might really be (`"parmesan" might be: parmesan-cheese ("parmesan cheese", 80%)`). For each of those:

- **Same thing you'd buy:** merge the new one into the existing one. This repoints the recipe and keeps the new wording as an alias, so the next import using it links automatically:
  ```sh
  node .claude/skills/import-recipe/merge-ingredient.mjs <new-id> <existing-id>
  ```
- **Different purchase** (e.g. "fresh basil" vs "dried basil"): leave it as a new ingredient.
- **Not sure:** ask the user, and list the open question in your report.

Re-running the link script is safe, because versions that already have an `ingredientId` are left alone.

Two imports must not run these scripts at the same time, because both write `data/ingredients.json`. When several agents import in parallel, have them stop after step 3, then run the link script for each recipe one after another.

## 4. Report back

Briefly list what you imported (ingredient count, groups, tags) and any modifications you made from the notes, including how you interpreted them. Tell the user to refresh the dashboard to see the new recipe.
