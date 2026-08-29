# ATOS Site Documentation

Technical documentation for the ATOS static website.

## 1. Site Purpose

**ATOS** stands for **Active Targeting and Optimization Suite**. The website is a browser-based interface for arc-style model rocket active-control airbrake simulations. It wraps the original Python notebook logic in a static HTML, CSS, and JavaScript application so users can run simulations locally in their browser without a Python server.

The site exposes three programs:

1. **EML26 Base Simulation** — simple baseline trajectory simulation.
2. **SITLSim 2026** — software-in-the-loop airbrake/PID simulation.
3. **Control System Optimizer 2026** — PID constant optimization using repeated SITL simulations.

The original notebook behavior is documented separately in `ATOS Notebooks Documentation.md`. That file is an input reference for this site documentation and should remain unchanged.

## 2. Runtime Architecture

ATOS is a static web application. The browser loads:

- `index.html` for page structure and input controls.
- `styles.css` for layout and styling.
- `app.js` for UI behavior, plotting, file handling, and worker communication.
- `sim_worker.js` for background Pyodide execution.
- `browser_adapter.py` for translating browser UI parameters into original simulation-function calls.
- Python simulation sources from `source/`.

No backend web server, Flask app, database, or hosted Python runtime is required. When deployed on GitHub Pages, the site serves static files only. Simulation work happens on the user's device inside the browser.

### 2.1 Pyodide Worker Flow

The technical flow is:

1. `index.html` loads Chart.js from jsDelivr and loads `app.js` as an ES module.
2. `app.js` starts `sim_worker.js` as a module worker.
3. `app.js` fetches the simulation source files and `browser_adapter.py` as text.
4. `sim_worker.js` loads Pyodide from jsDelivr.
5. Pyodide installs/imports packages inferred from the Python sources.
6. The worker executes the EML26 source and saves its `run_simulation` as `BASE_RUN_SIMULATION`.
7. The worker executes the SITL browser source and saves its `run_simulation` as `SITL_RUN_SIMULATION`.
8. The worker executes `browser_adapter.py`, which defines browser-facing functions such as `run_base_ui`, `run_sitl_ui`, and `run_optimizer_ui`.
9. User requests are sent from `app.js` to the worker through `postMessage`.
10. The worker returns JSON-serializable results to the UI.
11. `app.js` renders metrics, graphs, logs, and downloadable reports.

The worker keeps long Python runs off the main UI thread so the page remains responsive during simulations and optimizer sweeps.

## 3. File Responsibilities

| File or directory | Role |
|---|---|
| `index.html` | Static page shell, form controls, tabs, required CSV column table, and result containers. |
| `styles.css` | Site visual styling, responsive layout, cards, graphs, progress bars, and form styling. |
| `app.js` | Browser UI controller: initializes the worker, handles CSV uploads, gathers inputs, starts simulations, builds graphs, creates downloads, and logs status. |
| `sim_worker.js` | Web Worker that loads Pyodide, executes Python source, writes `/content/ORI.csv`, and runs Python commands requested by the UI. |
| `browser_adapter.py` | Python bridge between JavaScript JSON parameters and original simulation functions. Also converts pandas DataFrames into browser-friendly record lists. |
| `source/EML26_Base_Sim.py` | Browser-loaded Python source for the baseline simulation. |
| `source/SITLSim_2026_core_browser.py` | Browser-loaded Python source for SITL and optimizer simulation logic. |
| `source/*_core.py`, `source/*_report_original.py`, `source/*binary_search.py` | Preserved source/support files from the notebook extraction process. |
| `notebooks/` | Downloadable notebook versions intended for users who want to run or edit the simulations outside the website. |
| `ATOS Notebooks Documentation.md` | Reference documentation for the original notebook logic. Do not edit unless intentionally updating notebook documentation. |
| `README.md` | Deployment and repository-layout notes. |
| `logo.png` | Site logo and favicon. |

## 4. Browser-Side Data Handling

### 4.1 CSV Upload

Users upload an OpenRocket-exported CSV. The UI presents the required column order and tells users to use an OpenRocket export directly because some coefficient headers in the original code contain invisible zero-width-space characters.

When a file is selected:

1. `app.js` stores the file name and bytes.
2. If the worker is already ready, the bytes are sent to the worker immediately.
3. If the worker is still loading, the bytes are saved and sent after initialization.
4. `sim_worker.js` writes the uploaded bytes to Pyodide's virtual filesystem at `/content/ORI.csv`.

This mirrors the original Google Colab path expected by the notebook logic.

### 4.2 Required CSV Format

The OpenRocket CSV must contain these columns in this order:

1. `# Time (s)`
2. `Altitude (m)`
3. `Vertical velocity (m/s)`
4. `Angle of attack (°)`
5. `Mass (g)`
6. `Rotational moment of inertia (kg·m²)`
7. `CP location (cm)`
8. `CG location (cm)`
9. `Thrust (N)`
10. `Drag coefficient ()`
11. `Axial drag coefficient ()`
12. `Normal force coefficient ()`
13. `Pitch damping coefficient ()`
14. `Reference area (cm²)`

The simulation converts some OpenRocket units internally, including grams to kilograms and centimeters to meters where required.

## 5. Simulation Panels

### 5.1 EML26 Base Simulation

The EML26 panel exposes a simple trajectory simulation. It uses OpenRocket time-history data and user flight conditions to estimate trajectory and apogee.

Primary inputs include:

- Target height.
- Launch angle.
- Launch-rod height.
- Baseline wind.
- Simulation step.
- Stop condition.

Primary outputs include:

- Simulated apogee.
- Flight time.
- Estimated recovery deployment time.
- Downsampled trajectory rows for graphs.

Preset graphs include velocity/altitude, horizontal displacement, pitch, angle of attack, drag force, and mass.

### 5.2 SITLSim 2026

The SITL panel extends the baseline flight simulation with active airbrake control. It models avionics timing, measurement error, PID control, servo limits, airbrake area, and additional drag.

Additional technical inputs include:

- PID toggle.
- Kp, Kd, and Ki gains.
- IMU error and delay.
- Barometer error and delay.
- SD-card delay.
- Compute delay.
- Servo speed.
- Maximum brake area.
- Maximum servo angle.
- Mapping expressions between brake area, servo angle, and drag coefficient.

SITL outputs include simulated apogee plus controller and actuator data. Users can download `flight_data_results.csv` containing the returned result rows.

### 5.3 Control System Optimizer 2026

The optimizer panel uses repeated SITL simulations to search for PID constants. It tunes in sequence:

1. Kp.
2. Kd using the selected Kp.
3. Ki using the selected Kp and Kd.
4. Final validation using the optimized constants.

The normal mode performs binary search in the main simulation worker. Parallel mode creates multiple browser workers and evaluates multiple bracket points per tuning round using available CPU cores.

Optimizer outputs include:

- Best Kp.
- Best Kd.
- Best Ki.
- Final apogee.
- Convergence graphs for Kp, Kd, and Ki.
- A downloadable PDF-style optimization report generated in the browser.

## 6. Graphing and Result Rendering

ATOS uses Chart.js for plots. Each results panel can show preset graphs and user-created custom graphs.

For UI performance, `browser_adapter.py` down-samples DataFrame records returned to the browser when necessary. This does not change the simulation itself; it only reduces the amount of chart data transferred and rendered in the page.

## 7. Downloads Produced by the Site

The website can create these client-side downloads:

- `flight_data_results.csv` from SITLSim result rows.
- `PID_Optimization_Report_*.pdf` from optimizer results.

Downloads are generated entirely in the browser with JavaScript Blob URLs. No files are uploaded to a server.

## 8. Deployment Notes

The repository is designed for GitHub Pages deployment. The root-level `index.html` must remain at the repository root. If deploying from a branch, use the repository root as the Pages folder. If deploying with GitHub Actions, keep the static site files in the root and allow the workflow to publish them.

Because the site loads Pyodide and Chart.js from CDNs, users need network access when opening the page unless those dependencies are separately vendored and paths are updated.

## 9. Known Technical Limitations

- The simulation depends on exact OpenRocket CSV column names and ordering.
- Some original coefficient headers include invisible characters, so hand-made CSV files are risky.
- Pyodide package loading can take time on first page load.
- Optimizer runs can be computationally expensive because each candidate requires a full simulation.
- Browser performance varies by device and available CPU cores.
- Parachute descent, landing, and recovery-descent behavior are not accurate and should not be used as final recovery-performance predictions.
- Results are engineering simulation aids, not flight-safety certification outputs.

## 10. Developer Change Guidance

When modifying the site:

1. Keep original notebook documentation in `ATOS Notebooks Documentation.md` unchanged unless intentionally updating notebook docs.
2. Keep browser-specific glue in `browser_adapter.py`, `app.js`, or `sim_worker.js` instead of silently changing original simulation assumptions.
3. Preserve `/content/ORI.csv` behavior unless all notebook-derived code paths are updated together.
4. Keep user-facing units visible beside numeric inputs.
5. If adding new simulation outputs, update both the adapter result schema and graph presets.
6. Avoid blocking the main thread with long calculations; use workers for expensive computation.
