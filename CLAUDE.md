# Food Dashboard

## Design

Follow [DESIGN.md](DESIGN.md) for any UI change, and update it when a new rule comes up. In short: let the design say it instead of adding copy, keep any text to one short idea, and show state by styling rather than labels.

## Household facts

- Exactly two people rate meals, Eric and Sarah. Their names never change, so keying ratings by name is fine; don't add rename or migration code for people.
- Every meal eats 2 servings (2 people).
- Shopping is every other Sunday. Plans are 14-day cycles, Mon–Sun, with no mid-cycle trips.
- Ratings combine by plain average.
- Eric fills in recipe effort values himself. Don't guess or auto-fill them unless asked.

## Working here

- Two branches: `develop` and `main`. All work happens on `develop`. When a feature is finished (a release-worthy checkpoint, not partway through), merge `develop` into `main`, then carry on from `develop`.
- Features are planned in PLAN.md as phases. Mark phases "(done)" there as they land, and note any as-built changes.
- Commit as each feature finishes. Leave the user's live data out of commits: changes to `data/*.json` and `recipes/*.json` are theirs, made through the app.
- Test UI changes with Playwright (Firefox) against a scratch copy of the repo, not the real one, so test clicks never write to the real `data/` or `recipes/`.
- `npm test` runs the unit tests. The dev server is `npm run dev` on 127.0.0.1:5173. Only run one dev server on this folder at a time: two can overwrite each other's saves.
