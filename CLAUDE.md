# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Open `index.html` directly in a browser — no server, no build step:

```bash
open index.html
```

There are no dependencies, no package manager, and no build tools. The app runs entirely from the filesystem (`file://`).

## Architecture

The app is a single-page vanilla JS application split across three files with no module system (intentionally, to avoid `file://` CORS restrictions on ES modules).

**Data layer (`app.js`)** — flat map keyed by UUID, held in a module-level `data` variable and synced to `localStorage` under `familyTreeData`:

```json
{
  "members": { "<uuid>": { "id", "name", "profession", "parentId", "generation" } },
  "rootId": "<uuid>"
}
```

`generation` is stored on each node (1–5), not computed at render time. `parentId: null` marks the root (gen 1). `addRootMember` and `addMember` are the only write paths; both call `saveToStorage()` then `renderTree()`.

**Render cycle (`app.js`)** — full DOM teardown and rebuild on every data change:
1. `renderTree()` clears `#tree-rows`, creates one `.generation-row` div per generation
2. Nodes are sorted by `parentId` to keep siblings grouped visually
3. After DOM paint, `requestAnimationFrame` fires `drawConnectors()` which measures `getBoundingClientRect()` for every node relative to `#tree-container` and draws SVG elbow paths into `#connector-svg`

**SVG overlay (`index.html` + `app.js`)** — `#connector-svg` is absolutely positioned over `#tree-container` with `pointer-events: none`. Coordinates are container-relative (accounts for scroll). Each parent→children group produces one `<path>` element: vertical drop from parent, optional horizontal bar across siblings, vertical drops to each child.

**Modal (`index.html` + `app.js`)** — the single `#modal-overlay` is reused for both root creation (`parentId === null`) and child creation. Visibility is toggled via the `hidden` CSS class. `currentParentId` module-level variable tracks which parent is active.

## Key Constraints

- **No ES modules** — `app.js` is a plain IIFE. Do not use `import`/`export`.
- **No server** — the app must keep working when opened via `file://`.
- **Generation limit** — enforced in both `addMember()` (data) and `createNodeEl()` (UI — hides the `+` button at gen 5).
- **Render is always full** — there is no partial/diff update; `renderTree()` always rebuilds everything.
- **SVG sizing** — `drawConnectors()` sets `width`/`height` on the SVG to `scrollWidth`/`scrollHeight` of the container; this must happen after layout.

## Git & GitHub Workflow

**Commit and push after every meaningful change** — do not batch multiple features into one commit or leave work uncommitted at the end of a session. The goal is that the GitHub remote always reflects the current state of the project.

Commit message format:
```
type: short description

# types: feat, fix, docs, style, refactor
```

```bash
git add <files>
git commit -m "type: short description"
git push
```

Commit granularity guidelines:
- After adding or modifying a feature (e.g. new UI element, data function)
- After a bug fix
- After any change to `CLAUDE.md` or project documentation
- Before and after a significant refactor

Remote: `https://github.com/mambokadzi-bee/family-tree-app`
