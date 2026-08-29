# Rocket Simulation Programs — User Documentation

This guide documents the three uploaded notebooks **as currently written**:

1. `EML26_Base_Sim(1).ipynb`
2. `SITLSim_2026(1).ipynb`
3. `Control_System_Optimizer_2026(1).ipynb`

**Recommended environment: Google Colab.**

## 1. Quick Start

1. Export the required flight-data columns from OpenRocket.
2. Name the CSV exactly **`ORI.csv`**.
3. Open the desired notebook in Google Colab.
4. Upload `ORI.csv` so it exists at `/content/ORI.csv`.
5. Run the notebook cells from top to bottom.
6. Change the user-editable parameters in the setup/run cells before execution.

The current simulation code detects Colab and forces the input path to `/content/ORI.csv`. Therefore, although `run_simulation()` has a `csv_path` argument, the practical Colab input is a file named `ORI.csv`.

### Uploading the file

```python
from google.colab import files
uploaded = files.upload()
```

Verify it with:

```python
import os
print(os.path.exists('/content/ORI.csv'))
print(os.listdir('/content'))
```

---

# 2. Required ORI.csv Format

The CSV should be exported directly from OpenRocket and contain these columns **in this exact order**:

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

### Important header warning

The notebook source contains a **zero-width-space character** in several coefficient header names. They may visually look like `Drag coefficient ()`, but the actual string contains an invisible character. This is why an OpenRocket-generated export is strongly recommended rather than manually constructing or renaming the CSV headers.

The code converts `Mass (g)`, `CG location (cm)`, and `Reference area (cm²)` to SI units internally where needed.

---

# 3. EML26 Base Simulation

## Purpose

`EML26_Base_Sim` is the baseline flight simulation. It reads the OpenRocket time-history data, interpolates rocket properties, propagates the flight dynamics, and returns:

- simulated apogee,
- flight time,
- trajectory DataFrame,
- estimated recovery-deployment time.

## How it works

The simulation:

- Loads `ORI.csv`.
- Uses OpenRocket time histories for thrust, mass, CG, rotational inertia, aerodynamic coefficients, and reference area.
- Interpolates time-varying properties to the numerical simulation time step.
- Starts the rocket with the requested launch angle and zero initial translational velocity.
- Models flight dynamics, including gravity, atmosphere, wind, thrust, aerodynamic forces, and attitude.
- Tracks maximum altitude as simulated apogee.
- Uses OpenRocket vertical velocity to identify the input-data apogee.
- Estimates recovery deployment from a large drag-coefficient change.
- Stops according to `run_until`.

## Function inputs

```python
run_simulation(
    csv_path,
    target_height=236.22,
    theta0=90,
    lrod_h=1.8288,
    base_wind=4.47,
    step=0.001,
    run_until="Recovery Deployment"
)
```

| Input | Unit/type | Default | Meaning |
|---|---|---:|---|
| `csv_path` | path/string | `"ORI"` in notebook example | CSV argument; in Colab the implementation ultimately reads `/content/ORI.csv`. |
| `target_height` | m | 236.22 | Target-height parameter retained by the simulation interface. |
| `theta0` | ° | 90 | Initial launch/pitch angle. |
| `lrod_h` | m | 1.8288 | Launch-rod height. |
| `base_wind` | m/s | 4.47 | Baseline wind speed. |
| `step` | s | 0.001 | Numerical simulation time step. |
| `run_until` | text/number | `"Recovery Deployment"` | End condition. Source supports `Apogee`, `Landing`, numeric time, or recovery deployment/default behavior. |

### Example

```python
apogee, flight_time, df, chute_dep_t = run_simulation(
    "ORI",
    target_height=236.22,
    theta0=90,
    lrod_h=1.8288,
    base_wind=4.47,
    step=0.001,
    run_until="Recovery Deployment"
)
```

## Outputs

- `apogee` — maximum simulated altitude, m.
- `flight_time` — maximum time represented in `df`, s.
- `df` — trajectory DataFrame.
- `chute_dep_t` — estimated recovery deployment time, or `None`.

### EML26 trajectory columns

`time (s)`, `thrust (N)`, `Pitch (°)`, `Flight Path Angle (°)`, `AoA (°)`, `ax`, `ay`, `x velocity (m/s)`, `y velocity (m/s)`, `altitude (m)`, `horizontal displacement (m)`, `mass (kg)`, `Cd`, `Fd (N)`, `W (m/s)`.

---

# 4. SITLSim 2026

## Purpose

`SITLSim_2026` extends the baseline simulation with a software-in-the-loop representation of an apogee-control system.

It models:

- sensor error,
- sensor timing delays,
- SD-card delay,
- controller computation delay,
- PID control,
- airbrake area,
- servo angle,
- servo speed limits,
- airbrake drag.

## How it works

1. Loads `ORI.csv`.
2. Identifies apogee and uses the ascent data for the primary simulation.
3. Builds a controller timing delay from IMU + barometer + SD + compute delays.
4. Adds signed sensor error/noise.
5. Produces an apogee prediction from simulated measurements.
6. Calculates controller error as predicted apogee minus target height.
7. Averages a short history of error.
8. Calculates and smooths the derivative term.
9. Accumulates and clamps the integral term.
10. Applies a velocity-dependent deadband to reduce servo jitter.
11. Converts PID output into required brake area.
12. Converts required area to commanded servo angle.
13. Limits servo movement using maximum servo speed and maximum angle.
14. Converts physical servo position back into brake area.
15. Applies the airbrake effect to the flight physics.
16. Stores flight and controller data in `df`.

## Function inputs — all inputs

```python
run_simulation(
    csv_path,
    target_height=236.22,
    theta0=90,
    lrod_h=1.8288,
    base_wind=4.47,
    step=0.001,
    run_until="Recovery Deployment",
    PID_TOGGLE="ON",
    ctrl_kp=0.0009999990,
    ctrl_kd=0.0000100000,
    ctrl_ki=0.0000999999,
    ctrl_imu_error=0.03,
    ctrl_imu_delay=0.005,
    ctrl_baro_error=1.0,
    ctrl_baro_delay=0.005,
    ctrl_sd_delay=0.005,
    ctrl_compute_delay=0.000,
    servo_speed=375,
    brakes_max_A=0.0013524,
    servo_max_angle=37.55,
    brake_angle_cmd_expr="...",
    brake_angle_to_area_expr="...",
    brake_area_to_cd_expr="..."
)
```

| Input | Unit/type | Default | Meaning |
|---|---|---:|---|
| `csv_path` | path/string | `"ORI"` | CSV argument; Colab implementation overrides it to `/content/ORI.csv`. |
| `target_height` | m | 236.22 | Desired apogee. |
| `theta0` | ° | 90 | Initial launch/pitch angle. |
| `lrod_h` | m | 1.8288 | Launch-rod height. |
| `base_wind` | m/s | 4.47 | Baseline wind speed. |
| `step` | s | 0.001 | Numerical time step. |
| `run_until` | text/number | `"Recovery Deployment"` | Simulation end condition. |
| `PID_TOGGLE` | text | `"ON"` | Enables PID/airbrake control when `ON`. |
| `ctrl_kp` | dimensionless gain | 0.0009999990 | Proportional gain. |
| `ctrl_kd` | dimensionless gain | 0.0000100000 | Derivative gain. |
| `ctrl_ki` | dimensionless gain | 0.0000999999 | Integral gain. |
| `ctrl_imu_error` | m/s² | 0.03 | IMU error/noise magnitude. |
| `ctrl_imu_delay` | s | 0.005 | IMU response delay. |
| `ctrl_baro_error` | m | 1.0 | Barometer error/noise magnitude. |
| `ctrl_baro_delay` | s | 0.005 | Barometer response delay. |
| `ctrl_sd_delay` | s | 0.005 | SD-card write delay. |
| `ctrl_compute_delay` | s | 0.000 | Controller computation delay. |
| `servo_speed` | °/s | 375 | Maximum modeled servo rotation rate. |
| `brakes_max_A` | m² | 0.0013524 | Maximum total brake area. |
| `servo_max_angle` | ° | 37.55 | Maximum servo/airbrake angle. |
| `brake_angle_cmd_expr` | expression text | quadratic | Required brake area → commanded servo angle. |
| `brake_angle_to_area_expr` | expression text | quadratic | Servo angle → brake area. |
| `brake_area_to_cd_expr` | expression text | quadratic | Brake area → drag coefficient relationship. |

## Default airbrake mapping expressions

```text
brake_angle_cmd = 0.196 + 21942*A_needed + 4.07E+06*A_needed**2

brake_angle_to_area = -5.19E-06 + 4.36E-05*angle + -1.96E-07*angle**2

brake_area_to_cd = 1178*A_brakes + 11218*A_brakes**2
```

The generated functions clip `brake_angle_cmd` to `0 … servo_max_angle` and `brake_angle_to_area` to `0 … brakes_max_A`.

## PID behavior

The current code performs the following:

- Raw error = predicted apogee − target height.
- Maintains a short error history and averages it.
- D-term = change in error / total controller delay, followed by smoothing.
- I-term accumulates error × controller delay and is clamped to ±0.0001.
- Deadband is 2.5 m when controller velocity is below 30 m/s and 1 m otherwise.
- Inside the deadband, error and derivative are zeroed.
- After motor burn, PID output is clipped to `0 … brakes_max_A`.
- The PID command is mapped to servo angle.
- Servo movement is rate-limited.
- Physical servo position is converted back to brake area for the physics model.

## SITLSim output DataFrame

The notebook creates:

`time (s)`, `thrust (N)`, `Pitch (°)`, `Flight Path Angle (°)`, `AoA (°)`, `acceleration (m/s²)`, `ax`, `ay`, `velocity (m/s)`, `altitude (m)`, `horizontal displacement (m)`, `mass (kg)`, `Cd`, `Fd (N)`, `W (m/s)`, `Controller ay`, `Controller vy`, `Controller y`, `Controller theta`, `Controller drag`, `Apogee Predict (m)`, `PD error`, `PD dE`, `brake area needed`, `brake angle needed`, `actual servo pos (°)`, `ctrl servo pos (m²)`, `actual servo pos (m²)`.

**Implementation note:** the current SITL core does not explicitly return this data from `run_simulation()`. The notebook relies on global variables such as `df`, `results`, and `apogee`.

## Notebook diagnostic cells

- **Run Sim and Plot Results:** main 8×2 diagnostic plot.
- **Servo snapshots:** close-in view of servo deployment from 2–6 seconds.
- **PD-error diagnostic:** mean PD error over rows 2000–2099.
- **Data Saves:** writes `flight_data_results.csv` and downloads it.
- **Miscellaneous:** maximum altitude and mean/standard-deviation wind speed.

The servo snapshot cell explicitly warns that excessive servo movement can burn out the servo.

---

# 5. Control System Optimizer 2026

## Purpose

The optimizer searches for PID gains that make simulated apogee approach a selected target.

It searches in this order:

**Kp → Kd → Ki → final validation**

## Setup inputs

```python
target = 228.6
m_init = 475

kp_low = 0.000001
kp_high = 0.001
kd_low = 0.00000001
kd_high = 0.00001
ki_low = 0.0000001
ki_high = 0.0001
```

| Input | Unit/type | Default | Meaning |
|---|---|---:|---|
| `target` | m | 228.6 | Target apogee. |
| `m_init` | g | 475 | Initial mass shown in setup; **currently unused by the optimizer**. |
| `kp_low` / `kp_high` | gain | 1e-6 / 1e-3 | Kp search interval. |
| `kd_low` / `kd_high` | gain | 1e-8 / 1e-5 | Kd search interval. |
| `ki_low` / `ki_high` | gain | 1e-7 / 1e-4 | Ki search interval. |

## How the optimizer works

The optimizer uses `binary_search_gain()` with **20 iterations by default**:

1. Take the midpoint of the current gain range.
2. Run a SITL simulation with that candidate gain.
3. Read simulated apogee.
4. If apogee is above target, increase the lower bound because more control/drag is desired.
5. Otherwise, reduce the upper bound.
6. Repeat.

The best Kp is held while searching Kd. The best Kp and Kd are held while searching Ki.

A final validation simulation uses the three optimized gains.

## Important optimizer behavior

The optimizer explicitly calls the simulation with:

```python
run_simulation(
    csv_path,
    target_height=target,
    base_wind=7,
    ctrl_kp=...,
    ctrl_kd=...,
    ctrl_ki=...
)
```

Therefore:

- **base_wind = 7 m/s is hard-coded in the optimization cell.**
- Other SITL parameters remain at their function defaults unless the optimizer cell is edited.
- `m_init` is defined but is not passed into `run_simulation()`, so changing it currently has no effect.

## Optimizer outputs

- `best_kp`
- `best_kd`
- `best_ki`
- Kp/Kd/Ki search histories
- individual optimization times
- total optimization time
- final validation apogee
- `convergence_plot.png`
- generated `PID_Optimization_Report_YYYYMMDD_HHMM.pdf`

The PDF report contains the final gains, convergence plots, and detailed 20-iteration tables for Kp, Kd, and Ki.

---

# 6. Recommended End-to-End Workflow

| Step | Action |
|---|---|
| 1 | Export the required OpenRocket data. |
| 2 | Name the file `ORI.csv`. |
| 3 | Open the notebook in Google Colab. |
| 4 | Upload `ORI.csv` and verify `/content/ORI.csv`. |
| 5 | Run **EML26 Base** first to establish baseline apogee and trajectory. |
| 6 | Run **SITLSim 2026** with the desired target/control parameters. |
| 7 | Inspect apogee prediction, PID error, brake area, commanded angle, actual servo position, and servo snapshots. |
| 8 | Run **Control System Optimizer 2026** to search Kp/Kd/Ki. |
| 9 | Put the optimized gains into SITLSim and run a final validation. |
| 10 | Save `flight_data_results.csv` and the optimizer PDF report. |

---

# 7. Troubleshooting

### `ORI.csv` not found

Confirm that the file is named exactly `ORI.csv` and exists at:

```text
/content/ORI.csv
```

### Missing required column

Re-export from OpenRocket. Preserve the exact column names and order.

### Coefficient header mismatch

The code contains hidden zero-width-space characters in several coefficient headers. Use the OpenRocket-generated CSV rather than manually typing those headers.

### Unexpected recovery timing

Recovery deployment is inferred from a large drag-coefficient increase relative to the pre-apogee average. This is a heuristic, not a dedicated recovery event. The source also warns that the descent model is inaccurate.

### Optimizer results differ from a normal SITL run

The optimizer explicitly uses `base_wind=7` and otherwise relies on SITL function defaults for parameters it does not pass.

### `m_init` appears to do nothing

That is expected in the current code: `m_init` is defined in the optimizer setup but is not passed into the simulation.

### Excessive servo activity

Inspect the servo snapshot plots. The notebook warns that excessive servo movement can cause servo wear/burnout.

### Simulation errors / NaN values

The SITL code raises a `ValueError` when velocity, altitude, or acceleration becomes NaN, or when altitude becomes negative.

### Descent results

The source explicitly warns that the descent simulation is **not accurate**. Do not treat the current landing/descent output as a validated recovery model.

---

# 8. Quick Reference

| Program | Main purpose |
|---|---|
| **EML26 Base** | Baseline flight/trajectory simulation |
| **SITLSim 2026** | Flight simulation + simulated avionics + PID airbrake control |
| **Control System Optimizer 2026** | Automatic Kp/Kd/Ki search + convergence plots + PDF report |

**Common input:** `ORI.csv`, exported from OpenRocket with the 14 required columns in the specified order.
