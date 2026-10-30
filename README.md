# (un)Cleanroom?

Browser-only tool that turns a GTIMC environmental monitoring results CSV into a floor-plan heat map of
alert- and action-level excursions, plus summary tables. No server, no uploads: all analysis runs locally in the browser.

## How it works
- **Breach rule:** count ≥ alert level = alert; count ≥ action level = action (action takes priority). Only breaching plates are plotted.
- **Shape = sample type:** circle = Air Sample, square = Settle Plate, triangle = Contact Plate.
- **Colour = organism:** S orange, M blue, B green, St brown, UGNR purple, UGPR yellow, UGNC pink, Y teal, Mo slate, unidentified grey.
  Plates with several organisms are split into equal coloured segments.
- **Light marker with coloured outline = alert; bold marker with black outline = action.**
- **Placement:** plates are matched to the 2026 location list; where the name matches a piece of equipment it is placed beside it,
  otherwise in its grid square. Names not found in the list fall back to the grid reference and are flagged on screen.
- Columns are found by header name (Plate Location, Result Count, Plate Alert Level, Plate Action Level, Growth,
  Plate Grade, Result No Record, Result Date), falling back to the positions B, G, N, O, S.

## Repository layout
```
index.html            page
css/style.css         styling
js/app.js             parsing, analysis, drawing, UI
js/locations.js       GENERATED from the spreadsheet
js/floorplan.js       GENERATED (floor plan embedded as base64)
assets/floorplan.png  blank gridded floor plan (source for floorplan.js)
data/*.xlsx           Locations & Risk Assessment (source for locations.js)
tools/build_data.py   regenerates the two generated files
```

## Deploy on GitHub Pages
1. Create a GitHub account/organisation repo, e.g. `uncleanroom` (public, or private if your plan supports Pages on private repos).
2. Upload the **contents** of this folder to the repo root (so `index.html` is at the top level; keep `.nojekyll`).
   - Web: *Add file → Upload files*, drag everything in, commit.
   - Or command line:
     ```
     git init && git add . && git commit -m "Initial commit"
     git branch -M main
     git remote add origin https://github.com/<you>/uncleanroom.git
     git push -u origin main
     ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, Save.
4. After a minute the site is live at `https://<you>.github.io/uncleanroom/`.

## Updating
- **New risk assessment / locations:** replace the xlsx in `data/`, then `pip install openpyxl` and run `python tools/build_data.py`; commit `js/locations.js`.
- **New floor plan or marker positions:** replace `assets/floorplan.png`, run the same script, and update `GX`, `GY` (grid line pixels) and `ANCHORS` (equipment positions) at the top of `js/app.js`.
- **Local testing:** open `index.html` directly, or run `python -m http.server` and visit http://localhost:8000.

## Notes
Output is a decision-support visual, not a controlled record. Confirm excursions against the source LIMS data.
