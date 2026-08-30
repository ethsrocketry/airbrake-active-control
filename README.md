# How to Use ATOS

A friendly guide to running ATOS, downloading notebooks, and editing the simulations.

## What ATOS Is

**ATOS** is the **Active Targeting and Optimization Suite** for arc-style model rocket active-control airbrakes. It lets you upload an OpenRocket flight export, run airbrake-related simulations, view graphs, and tune PID constants from a web browser.

ATOS includes three main tools:

- **EML26 Base** — a simple flight simulation using OpenRocket data.
- **SITLSim 2026** — a software-in-the-loop simulation for airbrake control.
- **Control System Optimizer** — a PID optimizer that searches for useful Kp, Kd, and Ki constants.

> Important: parachute descent, landing, and descent-under-recovery behavior are not accurate in these simulations. Use ATOS mainly for ascent, apogee, and airbrake-control development.
> ATOS Center of Pressure modeling is not yet programmed in. Center of Pressure is assumed to be 0.442 *for the moment*.

## Before You Start

You need an OpenRocket CSV export named or treated as `ORI.csv`. The website will automatically store your uploaded file internally as `/content/ORI.csv`, so the file does not have to already be in that path on your computer.

For best results, export directly from OpenRocket instead of building the CSV by hand. Some column headers used by the original notebook code contain invisible characters that are easy to miss.

## Required OpenRocket CSV Columns

Your CSV should include these columns in this exact order:

| # | Column | Unit |
|---|---|---|
| 1 | `# Time (s)` | s |
| 2 | `Altitude (m)` | m |
| 3 | `Vertical velocity (m/s)` | m/s |
| 4 | `Angle of attack (°)` | ° |
| 5 | `Mass (g)` | g |
| 6 | `Rotational moment of inertia (kg·m²)` | kg·m² |
| 7 | `CP location (cm)` | cm |
| 8 | `CG location (cm)` | cm |
| 9 | `Thrust (N)` | N |
| 10 | `Drag coefficient ()` | dimensionless |
| 11 | `Axial drag coefficient ()` | dimensionless |
| 12 | `Normal force coefficient ()` | dimensionless |
| 13 | `Pitch damping coefficient ()` | dimensionless |
| 14 | `Reference area (cm²)` | cm² |

## Opening the Website

1. Open the ATOS website in your browser.
2. Wait for the status pill at the top of the page to say the Python worker is ready.
3. If the worker takes a while, be patient. The site is loading Pyodide and scientific Python packages in your browser.
4. Upload your OpenRocket CSV in the **OpenRocket input** section.
5. Choose one of the three tabs: **EML26 Base**, **SITLSim 2026**, or **Control System Optimizer**.

## Uploading Your ORI CSV

1. Click **Upload ORI CSV**.
2. Select your OpenRocket-exported CSV file.
3. Confirm that the file status says it was loaded as `/content/ORI.csv`.
4. If you uploaded the file before the Python engine finished loading, ATOS will automatically install it after the worker is ready.

## Using EML26 Base

Use **EML26 Base** when you want a simple simulation of the rocket flight without the full active-control loop.

### Good uses for EML26 Base

- Checking a baseline trajectory.
- Comparing approximate apogee against OpenRocket data.
- Testing launch angle, wind, launch-rod height, and time-step settings.
- Getting quick graphs for velocity, altitude, pitch, drag, and mass.

### How to run it

1. Open the **EML26 Base** tab.
2. Enter your flight inputs:
   - **Target height** in meters.
   - **Launch angle** in degrees. Use `90` for vertical.
   - **Launch-rod height** in meters.
   - **Baseline wind** in meters per second.
   - **Simulation step** in seconds. Smaller steps can be slower.
   - **Run until** condition.
3. Click **Run EML26 Base**.
4. Review the displayed apogee, flight time, and recovery deployment estimate.
5. Use preset or custom graphs to inspect the result.

## Using SITLSim 2026

Use **SITLSim 2026** when you want to simulate the active airbrake control system. This is the main tool for checking how the airbrakes and PID controller affect apogee.

### What SITL means here

SITL means **software-in-the-loop**. The site runs the flight simulation and a simulated controller together. It can include sensor error, sensor delay, compute delay, servo motion limits, brake area, and brake drag.

### How to run it

1. Open the **SITLSim 2026** tab.
2. Enter the flight inputs, such as target height, launch angle, wind, and time step.
3. Choose whether the **PID controller** is `ON` or `OFF`.
4. Enter PID gains:
   - **Kp** controls proportional response to apogee prediction error.
   - **Kd** controls response to error change.
   - **Ki** controls accumulated error response.
5. Enter avionics assumptions:
   - IMU error and delay.
   - Barometer error and delay.
   - SD-card delay.
   - Compute delay.
6. Enter airbrake and servo assumptions:
   - Servo speed.
   - Maximum brake area.
   - Maximum servo angle.
   - Brake/servo/drag mapping expressions.
7. Click **Run SITLSim 2026**.
8. Review apogee, controller behavior, brake area, servo position, and graphs.
9. Click **Download flight_data_results.csv** if you want a copy of the returned simulation data.

### Tips

- Run once with PID `OFF` to see the uncontrolled baseline in the SITL model.
- Then run with PID `ON` and compare apogee and brake graphs.
- Watch servo position graphs to make sure commands are physically reasonable.
- If the simulation is slow, try a larger time step for early experimentation.

## Using the Control System Optimizer

Use the **Control System Optimizer** when you want ATOS to search for PID constants that bring simulated apogee closer to a target.

### What the optimizer does

The optimizer runs many SITL simulations. It tunes the gains in this order:

1. **Kp** first.
2. **Kd** second, using the best Kp found.
3. **Ki** third, using the best Kp and Kd found.
4. A final validation simulation with all three optimized constants.

The optimizer is meant to provide candidate constants for testing and iteration, not guaranteed final flight constants.

### How to run it

1. Open the **Control System Optimizer** tab.
2. Enter the **Target apogee** in meters.
3. Set flight and avionics inputs so they match the condition you want to tune for.
4. Set lower and upper bounds for Kp, Kd, and Ki.
5. Choose **Iterations per gain**. More iterations can improve the search but will take longer.
6. Choose compute mode:
   - **Normal binary search** for the standard behavior.
   - **Parallel browser workers** to use more CPU cores when your device can handle it.
7. Click **Run Optimizer**.
8. Wait for the optimizer to finish. It may take much longer than a single simulation.
9. Review the best Kp, Kd, Ki, final apogee, and convergence graphs.
10. Click **Download optimizer PDF report** if you want a saved report.

### Tips

- Start with broad gain bounds, then narrow them based on the optimizer output.
- Keep flight inputs consistent when comparing optimizer runs.
- Do not assume one optimized PID set works for every rocket, motor, wind condition, or target altitude.

## Working with Graphs

After a simulation completes, ATOS shows preset graphs. You can also:

- Add more preset graphs.
- Create a custom graph.
- Choose data columns for custom graph series.
- Remove graphs you do not need.

Graphs are for inspection and debugging. If you need raw values, use the available CSV/report download or run the notebooks directly.

## Downloading Notebook Files

The repository includes notebook files in the `notebooks/` folder:

- `notebooks/EML26_Base_Sim.ipynb`
- `notebooks/SITLSim_2026.ipynb`
- `notebooks/Control_System_Optimizer_2026.ipynb`

To download a notebook from GitHub:

1. Open the repository on GitHub.
2. Go to the `notebooks/` folder.
3. Click the notebook you want.
4. Click the download button or choose **Raw**, then save the file with the `.ipynb` extension.
5. Open it in Google Colab, JupyterLab, VS Code, or another notebook editor.

## Running the Notebooks in Google Colab

Google Colab is the recommended beginner-friendly notebook environment.

1. Go to [Google Colab](https://colab.research.google.com/).
2. Upload or open one of the `.ipynb` files.
3. Upload your OpenRocket CSV as `ORI.csv`.
4. Make sure the notebook can access the file at `/content/ORI.csv`.
5. Run the cells from top to bottom.
6. Edit user parameters in the setup or run cells before rerunning.

A quick Colab upload cell is:

```python
from google.colab import files
uploaded = files.upload()
```

After uploading, you can check the file with:

```python
import os
print(os.path.exists('/content/ORI.csv'))
print(os.listdir('/content'))
```

## Editing the Notebooks

You can edit notebooks to experiment with the simulation logic, constants, plots, or output files.

Recommended workflow:

1. Make a copy of the notebook before editing.
2. Change one thing at a time.
3. Rerun from the top after major changes so variables do not carry over unexpectedly.
4. Save important outputs separately.
5. Compare edited results against the website or the original notebook.

### Which notebook should I edit?

- Edit **EML26 Base** for simple trajectory simulation changes.
- Edit **SITLSim 2026** for active-control, PID, servo, sensor, and airbrake behavior changes.
- Edit **Control System Optimizer 2026** for PID search behavior, optimizer bounds, iteration strategy, or optimizer reports.

## Website vs. Notebook Use

Use the **website** when you want:

- A friendly interface.
- Quick parameter changes.
- Built-in graph dashboards.
- No local Python setup.
- Browser-based reports and downloads.

Use the **notebooks** when you want:

- Full access to the Python code.
- Deeper edits to equations or logic.
- Custom plots or exports.
- Step-by-step inspection of intermediate variables.
- Easier experimentation with new control ideas.

## Troubleshooting

### The Python engine is slow to start

This is normal on first load. The browser has to download and initialize Pyodide and Python packages.

### The site says no CSV is loaded

Upload your OpenRocket CSV in the first section. The simulation buttons require the CSV to be loaded first.

### The simulation errors right away

Check that your CSV has the expected OpenRocket columns in the expected order. If you manually edited headers, export again from OpenRocket.

### Optimizer takes a long time

The optimizer runs many full SITL simulations. Reduce iterations for early tests, increase the simulation time step, or try parallel mode if your computer has enough CPU resources.

### Landing or parachute descent looks wrong

That is expected. Parachute descent is not accurate in this model. Focus on ascent, airbrake deployment behavior, apogee prediction, and apogee-control trends.

## Safety Reminder

ATOS is a simulation and tuning tool. Always validate results with engineering review, ground testing, safe procedures, and applicable launch rules before using any values in flight hardware.
