# Rocket Simulation GitHub Pages App

This repository is ready to deploy as a GitHub Pages site.

## Important: repository layout

`index.html` is in the **repository root**. Do not put the contents inside another `rocket-pages/` folder when uploading to GitHub.

The repository should look like:

```text
index.html
app.js
styles.css
browser_adapter.py
source/
.github/workflows/pages.yml
.nojekyll
```

## Deploy

### Easiest method: GitHub Actions

1. Create a new GitHub repository.
2. Upload the **contents of this ZIP**, not the ZIP's containing folder.
3. Make sure `index.html` is visible at the top level of the repository.
4. Push to the `main` branch.
5. Open **Settings → Pages**.
6. Under **Build and deployment**, select **GitHub Actions**.
7. Wait for the `Deploy GitHub Pages` workflow to finish.
8. Open the Pages URL shown in the workflow or under Settings → Pages.

The workflow is included in `.github/workflows/pages.yml`.

### Alternative: deploy from a branch

If you choose **Deploy from a branch**, select `main` and folder `/ (root)`.

## Why the app is browser-based

The interface is static HTML/JavaScript and loads Pyodide in the browser. The simulation Python runs client-side; no Python server is required.

## Input file

Upload an OpenRocket-exported CSV named `ORI.csv`. The interface writes it to the browser-side path expected by the simulation: `/content/ORI.csv`.
