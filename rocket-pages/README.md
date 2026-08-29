# Rocket Simulation Suite — GitHub Pages

This repository turns the three uploaded Python/Jupyter simulations into browser-based mini apps:

- **EML26 Base Simulation**
- **SITLSim 2026**
- **Control System Optimizer 2026**

## Why GitHub Pages works

GitHub Pages is static hosting, so it cannot directly run normal server-side Python. This version uses **Pyodide**, which runs Python in WebAssembly inside the browser. The original simulation code remains Python; the JavaScript layer only supplies files/UI inputs and displays results.

The site uses the versioned Pyodide 314.0.6 CDN distribution. Versioned CDN URLs are recommended for deployed Pyodide applications.

## Deploy

1. Create a GitHub repository.
2. Upload everything in this folder, keeping the `source/` directory.
3. Go to **Settings → Pages**.
4. Choose **Deploy from a branch**.
5. Select the branch containing these files and the `/ (root)` folder.
6. Open the generated GitHub Pages URL.

No backend server is required.

## How the original code is preserved

The files in `source/` are exported directly from the notebook code cells, including comments.

The only source-level change made to the SITL browser copies is a plumbing change that exposes the local `results` list to the UI. This is necessary because the original notebook's SITL plotting cell expects `results` outside `run_simulation()`, while Python function scope normally makes that local. The actual flight/control calculations are unchanged.

The browser also supplies a tiny `google.colab` module marker. The original code checks for `google.colab` to select `/content/ORI.csv`; this lets the original path-selection branch work in the browser without changing the simulation logic.

## Input file

Upload the OpenRocket-exported CSV in the UI. The app automatically stores the selected file as:

`/content/ORI.csv`

Required columns, in order:

1. `# Time (s)` — s
2. `Altitude (m)` — m
3. `Vertical velocity (m/s)` — m/s
4. `Angle of attack (°)` — °
5. `Mass (g)` — g
6. `Rotational moment of inertia (kg·m²)` — kg·m²
7. `CP location (cm)` — cm
8. `CG location (cm)` — cm
9. `Thrust (N)` — N
10. `Drag coefficient ()` — dimensionless
11. `Axial drag coefficient ()` — dimensionless
12. `Normal force coefficient ()` — dimensionless
13. `Pitch damping coefficient ()` — dimensionless
14. `Reference area (cm²)` — cm²

Use the OpenRocket export directly. Some coefficient headers in the original source contain an invisible zero-width-space character.

## Notes

- The browser does **not** silently replace the simulation equations with JavaScript equivalents.
- The original Python simulation functions are loaded and executed in Pyodide.
- The UI reproduces the original program inputs and makes ambiguous inputs explicit with units and examples.
- The optimizer retains the original sequential binary search and its original hard-coded `base_wind=7` behavior.
- The optimizer UI defaults to 20 iterations, matching the notebook, but allows fewer/more iterations for practical browser runs.
- The browser draws charts with Chart.js rather than requiring Matplotlib display in the page. This does not alter simulation calculations.
- The original PDF-report cell is preserved in `source/Control_System_Optimizer_report_original.py` for reference. The browser UI downloads optimizer results as JSON instead of invoking the Colab-only `files.download()` call.
- The original code's warning that descent/landing is not accurate remains applicable.
