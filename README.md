# Happy Li — portfolio town (v0)

A walkable pixel-art town where each building is a design case study.

- **Views:** switch between *Top-down* (sunset / grain look) and *Isometric* (clean dithered look) with the control in the top-left or the `V` key.
- **Move:** WASD / arrow keys, or click/tap anywhere. Click a building to walk there.
- **Open:** walk up to a door — the Dynamic Island pops up — then press `E` or tap it to open the case study sheet.
- **Dock:** About, Work (all projects), Gallery, Contact, and a link to the classic site.
- **Links:** `?view=iso` and `?open=splunk` deep-link to a view or case study.

## Edit content

All text lives in `src/content.js`. Replace the placeholder `sections` with your case study content.

## Run locally

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Deploys as-is to GitHub Pages, Netlify or Vercel.

## Files

- `src/world.js` — the town: buildings, props, cats, collisions
- `src/main.js` — camera views, pixel/grade post-processing, movement
- `src/ui.js` — Dock, Dynamic Island, bottom sheet
- `vendor/three.module.min.js` — three.js r170 (MIT)
