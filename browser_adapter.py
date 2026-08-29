# Browser adapter only: keeps the original simulation logic in the source files.
# The adapter is responsible for connecting the UI inputs to the original functions.
import json
import pandas as pd

def _df_records(frame, limit=5000):
    if frame is None or frame.empty:
        return []
    # Downsample only the UI payload if needed; simulation itself is NOT changed.
    if len(frame) > limit:
        idx = __import__('numpy').linspace(0, len(frame)-1, limit).astype(int)
        frame = frame.iloc[idx]
    return json.loads(frame.replace({__import__('numpy').nan: None}).to_json(orient='records'))

def run_base_ui(params):
    apogee, flight_time, df, chute_dep_t = BASE_RUN_SIMULATION(
        params.get('csv_path','ORI'),
        target_height=float(params['target_height']),
        theta0=float(params['theta0']),
        lrod_h=float(params['lrod_h']),
        base_wind=float(params['base_wind']),
        step=float(params['step']),
        run_until=params['run_until'] if not isinstance(params['run_until'], str) or not params['run_until'].startswith('__NUM__') else float(params['run_until'][7:])
    )
    return {
        'apogee':float(apogee),
        'flight_time':float(flight_time),
        'chute_dep_t':None if chute_dep_t is None else float(chute_dep_t),
        'rows':_df_records(df)
    }

def run_sitl_ui(params):
    SITL_RUN_SIMULATION(
        params.get('csv_path','ORI'),
        target_height=float(params['target_height']),
        theta0=float(params['theta0']),
        lrod_h=float(params['lrod_h']),
        base_wind=float(params['base_wind']),
        step=float(params['step']),
        run_until=params['run_until'] if not isinstance(params['run_until'], str) or not params['run_until'].startswith('__NUM__') else float(params['run_until'][7:]),
        PID_TOGGLE=str(params['PID_TOGGLE']),
        ctrl_kp=float(params['ctrl_kp']),
        ctrl_kd=float(params['ctrl_kd']),
        ctrl_ki=float(params['ctrl_ki']),
        ctrl_imu_error=float(params['ctrl_imu_error']),
        ctrl_imu_delay=float(params['ctrl_imu_delay']),
        ctrl_baro_error=float(params['ctrl_baro_error']),
        ctrl_baro_delay=float(params['ctrl_baro_delay']),
        ctrl_sd_delay=float(params['ctrl_sd_delay']),
        ctrl_compute_delay=float(params['ctrl_compute_delay']),
        servo_speed=float(params['servo_speed']),
        brakes_max_A=float(params['brakes_max_A']),
        servo_max_angle=float(params['servo_max_angle']),
        brake_angle_cmd_expr=str(params['brake_angle_cmd_expr']),
        brake_angle_to_area_expr=str(params['brake_angle_to_area_expr']),
        brake_area_to_cd_expr=str(params['brake_area_to_cd_expr'])
    )

    frame = pd.DataFrame(results, columns=[
        'time (s)', 'thrust (N)','Pitch (°)', 'Flight Path Angle (°)', 'AoA (°)', 'acceleration (m/s^2)', 'ax',
        'ay', 'velocity (m/s)', 'altitude (m)', 'horizontal displacement (m)',
        'mass (kg)', 'Cd', 'Fd (N)', 'W (m/s)', 'Controller ay', 'Controller vy', 'Controller y', 'Controller theta',
        'Controller drag', 'Apogee Predict (m)', 'PD error', 'PD dE', 'brake area needed',
        'brake angle needed', 'actual servo pos (°)', 'ctrl servo pos (m^2)', 'actual servo pos (m^2)'
    ])

    return {
        'apogee':float(apogee),
        'rows':_df_records(frame),
        'columns':list(frame.columns)
    }


def _optimizer_sim_kwargs(params, target, gains):
    return {
        'target_height': target,
        'theta0': float(params.get('theta0', 90)),
        'lrod_h': float(params.get('lrod_h', 1.8288)),
        'base_wind': float(params.get('base_wind', 7)),
        'step': float(params.get('step', 0.001)),
        'run_until': params.get('run_until', 'Apogee'),
        'PID_TOGGLE': str(params.get('PID_TOGGLE', 'ON')),
        'ctrl_kp': gains['kp'],
        'ctrl_kd': gains['kd'],
        'ctrl_ki': gains['ki'],
        'ctrl_imu_error': float(params.get('ctrl_imu_error', 0.03)),
        'ctrl_imu_delay': float(params.get('ctrl_imu_delay', 0.005)),
        'ctrl_baro_error': float(params.get('ctrl_baro_error', 1.0)),
        'ctrl_baro_delay': float(params.get('ctrl_baro_delay', 0.005)),
        'ctrl_sd_delay': float(params.get('ctrl_sd_delay', 0.005)),
        'ctrl_compute_delay': float(params.get('ctrl_compute_delay', 0.0)),
        'servo_speed': float(params.get('servo_speed', 375)),
        'brakes_max_A': float(params.get('brakes_max_A', 0.0013524)),
        'servo_max_angle': float(params.get('servo_max_angle', 37.55)),
        'brake_angle_cmd_expr': str(params.get('brake_angle_cmd_expr', 'brake_angle_cmd = 0.196 + 21942*A_needed + 4.07E+06*A_needed**2')),
        'brake_angle_to_area_expr': str(params.get('brake_angle_to_area_expr', 'brake_angle_to_area = -5.19E-06 + 4.36E-05*angle + -1.96E-07*angle**2')),
        'brake_area_to_cd_expr': str(params.get('brake_area_to_cd_expr', 'brake_area_to_cd = 1178*A_brakes + 11218*A_brakes**2'))
    }

def run_optimizer_eval(params):
    target = float(params['target'])
    gains = {
        'kp': float(params.get('kp', 0)),
        'kd': float(params.get('kd', 0)),
        'ki': float(params.get('ki', 0))
    }
    SITL_RUN_SIMULATION('/content/ORI.csv', **_optimizer_sim_kwargs(params, target, gains))
    return {'apogee': float(apogee)}

def binary_search_gain(gain_name, low, high, target, constant_gains, params, iterations=20):
    import time
    start_time = time.time()
    history_gains = []
    history_apogees = []

    print(f"\n--- Optimizing {gain_name.upper()} ---")

    for i in range(iterations):
        mid = (low + high) / 2
        gains = constant_gains.copy()
        gains[gain_name] = mid

        # Run simulation
        SITL_RUN_SIMULATION('/content/ORI.csv', **_optimizer_sim_kwargs(params, target, gains))

        current_apogee = apogee

        history_gains.append(mid)
        history_apogees.append(current_apogee)

        # If apogee > target, we need MORE control/drag
        if current_apogee > target:
            low = mid
        else:
            high = mid

    duration = time.time() - start_time
    return mid, history_gains, history_apogees, duration


def run_optimizer_ui(params):
    import time

    target=float(params['target'])

    kp_low=float(params['kp_low'])
    kp_high=float(params['kp_high'])

    kd_low=float(params['kd_low'])
    kd_high=float(params['kd_high'])

    ki_low=float(params['ki_low'])
    ki_high=float(params['ki_high'])

    iterations=int(params.get('iterations',20))

    total_start=time.time()

    # 1. Optimize KP
    best_kp,kp_hist,kp_apo_hist,kp_time=binary_search_gain(
        'kp',
        kp_low,
        kp_high,
        target,
        {'kp':0,'kd':0,'ki':0},
        params=params,
        iterations=iterations
    )

    # 2. Optimize KD (using best KP)
    best_kd,kd_hist,kd_apo_hist,kd_time=binary_search_gain(
        'kd',
        kd_low,
        kd_high,
        target,
        {'kp':best_kp,'kd':0,'ki':0},
        params=params,
        iterations=iterations
    )

    # 3. Optimize KI (using best KP and KD)
    best_ki,ki_hist,ki_apo_hist,ki_time=binary_search_gain(
        'ki',
        ki_low,
        ki_high,
        target,
        {'kp':best_kp,'kd':best_kd,'ki':0},
        params=params,
        iterations=iterations
    )

    total_duration=time.time()-total_start

    # Final validation run
    SITL_RUN_SIMULATION('/content/ORI.csv', **_optimizer_sim_kwargs(params, target, {'kp': best_kp, 'kd': best_kd, 'ki': best_ki}))

    final_apogee=apogee

    return {
        'best_kp':float(best_kp),
        'best_kd':float(best_kd),
        'best_ki':float(best_ki),

        'kp_hist':[float(x) for x in kp_hist],
        'kp_apo_hist':[float(x) for x in kp_apo_hist],

        'kd_hist':[float(x) for x in kd_hist],
        'kd_apo_hist':[float(x) for x in kd_apo_hist],

        'ki_hist':[float(x) for x in ki_hist],
        'ki_apo_hist':[float(x) for x in ki_apo_hist],

        'kp_time':float(kp_time),
        'kd_time':float(kd_time),
        'ki_time':float(ki_time),

        'total_duration':float(total_duration),
        'final_apogee':float(final_apogee),
        'target':target
    }
