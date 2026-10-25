# Contributing to Алаас

## Setup
```sh
npm install
npm run dev     # http://127.0.0.1:5190
```
Start with [`AGENTS.md`](AGENTS.md): it maps every doc in `docs/`. The check tools drive system Chrome
headless (`CHROME=<path>` if it is not in `/Applications`) or Playwright WebKit
(`npx playwright-core install webkit`).

## Before you send a change
The last three run against a dev server (`PORT` if it is not 5190):

| Check | Pass |
|---|---|
| `npm run lint` | no undefined or unused names |
| `npm run build` | builds without errors |
| `npm run walkcheck -- chrome` (and `webkit`) | `0 shaders built, 0 pipelines created after ready` |
| `npm run hitch -- chrome` | no worse than before your change (p99, hitches, `pipelines after fade: 0`) |
| `npm run loadprof -- chrome` | first world pixel and playable no slower than before |

For anything visual, compare before/after screenshots: `npm run shot -- "/?auto&at=x,z,yaw" out.png`.
More in [`docs/testing.md`](docs/testing.md).

## Code
- Follow the [performance rules](docs/architecture.md#performance-rules): no lights added, removed or
  hidden at runtime, no material changes after the warm-up, `positionPrevious` with a custom
  `positionNode`, at most 16 textures per shader stage.
- New buildings and props follow the [model-module contract](docs/models.md).
- Loading work follows [`docs/loading.md`](docs/loading.md).
- Plain ES modules, 2-space indent, single quotes, semicolons (`.editorconfig`). Each file opens with a
  one-line comment on what it does. Shared math lives in `src/util.js`.
- Update the doc your change touches, one line per fact.

## Content
- **Cultural accuracy first.** Every entry in `src/data/entries.json` carries its `sources`; don't invent
  customs, words or objects. When unsure, say so in `notes`.
- **Sakha text is written by hand**, never machine-translated. Check terms in
  [sakhatyla.ru](https://sakhatyla.ru) and [sah.wikipedia.org](https://sah.wikipedia.org).
  Language order: Sakha, English, Russian. The voice rules are in [`docs/content.md`](docs/content.md).
- **Sacred acts are explained, never played**: shamanic rites, the great algys and sacrifice stay on
  the cards.
- **Free assets only**: CC0, or CC BY / BY-SA credited in [`docs/credits.md`](docs/credits.md). No paid
  services.

## Licence
By contributing you agree that your code is released under MIT and your text and other original
content under CC BY-SA 4.0 (see [`LICENSE`](LICENSE)).
