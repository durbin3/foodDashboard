# Design

How the Food Dashboard should look and read. Short on purpose.

## Let the design say it

Before adding any descriptive, explanatory or flavor text, try to make the design say it instead: layout, grouping, placement, icons, color, control states. If the design makes the point obvious, the text isn't needed.

- **Show a state on the thing it's about.** Style the value instead of adding a word next to it. An over-budget meal's "effort 2" turns caution yellow; it doesn't say "over".
- **Layout over labels.** A rule between a main and its sides says "these are separate parts". A heading that names the weekday once per row says "these two days share a weekday".
- **Controls over instructions.** A checkbox and a dropdown on a day say what that day can be. Don't write sentences explaining how to use them.
- **Show the few that matter.** Three meal suggestions, not a long list with a "More…" link.
- **A list and a panel, not a wide table.** When each thing has many settings and none needs comparing across rows (the Ingredients tab), list just the names and show the selected one's settings beside it.
- **Group settings by what they're for.** Put fields under the question they answer (Grocery list, Storage), in a label–control grid, not one long stack.

## When text is needed

- One idea, a few words. Nobody reads long lines.
- Detail goes in a tooltip (`title`), not on the page.
- No paragraphs of help, hints, or "how this works".
- When you touch a page, trim copy that the design now makes redundant.

## Interaction

- **Direct manipulation.** If something can be dragged into place, it should be draggable from wherever it shows up. Don't make people click it first and then drag it.
- **Changes save on their own.** No Save buttons for settings or the plan. Offer Undo where a change is easy to make by mistake.
- **One clean line, not two.** Don't stack a separator on top of another border.

## Color

Colors are CSS variables in `src/styles.css`, each with a light and a dark value:

| Token | Use |
| --- | --- |
| `--accent` | Primary actions, links, the current page |
| `--muted` | Secondary info, metadata |
| `--warn`, `--warn-bg` | Caution: over budget, needs attention, guessed values |
| `--danger` | Destructive actions |
| `--changed`, `--added` | Edited or new things in an editor |

Use a token, never a raw color, so dark mode keeps working.
