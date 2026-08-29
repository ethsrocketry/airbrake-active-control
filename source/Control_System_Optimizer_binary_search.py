import matplotlib.pyplot as plt
import time
import numpy as np

def binary_search_gain(gain_name, low, high, target, constant_gains, iterations=20):
    start_time = time.time()
    history_gains = []
    history_apogees = []

    print(f"\n--- Optimizing {gain_name.upper()} ---")

    for i in range(iterations):
        mid = (low + high) / 2
        gains = constant_gains.copy()
        gains[gain_name] = mid

        # Run simulation
        run_simulation(csv_path, target_height=target, base_wind=7, ctrl_kp=gains['kp'], ctrl_kd=gains['kd'], ctrl_ki=gains['ki'])
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

csv_path = "/content/ORI.csv"

# --- Execution ---
total_start = time.time()

# 1. Optimize KP
best_kp, kp_hist, kp_apo_hist, kp_time = binary_search_gain('kp', kp_low, kp_high, target, {'kp': 0, 'kd': 0, 'ki': 0})

# 2. Optimize KD (using best KP)
best_kd, kd_hist, kd_apo_hist, kd_time = binary_search_gain('kd', kd_low, kd_high, target, {'kp': best_kp, 'kd': 0, 'ki': 0})

# 3. Optimize KI (using best KP and KD)
best_ki, ki_hist, ki_apo_hist, ki_time = binary_search_gain('ki', ki_low, ki_high, target, {'kp': best_kp, 'kd': best_kd, 'ki': 0})

total_duration = time.time() - total_start

# Final validation run
run_simulation(csv_path, target_height=target, base_wind=7, ctrl_kp=best_kp, ctrl_kd=best_kd, ctrl_ki=best_ki)
final_apogee = apogee

# --- Final Print Out --- (by Gemini Flash 3.5)
print("\n" + "="*45)
print("FINAL OPTIMIZED PARAMETERS & TIMING")
print("-" * 45)
print(f"Best Kp: {best_kp:.10f} | Time: {kp_time:.4f}s")
print(f"Best Kd: {best_kd:.10f} | Time: {kd_time:.4f}s")
print(f"Best Ki: {best_ki:.10f} | Time: {ki_time:.4f}s")
print("-" * 45)
print(f"Total Optimization Time: {total_duration:.4f}s")
print(f"Final Apogee: {final_apogee:.4f} m (Target: {target}m)")
print("="*45)

# --- Plotting Convergence (Keep in optimizer) --- (by Gemini Flash 3.5)
fig, axes = plt.subplots(1, 3, figsize=(18, 5))
titles = [('KP', kp_apo_hist), ('KD', kd_apo_hist), ('KI', ki_apo_hist)]
colors = ['tab:blue', 'tab:orange', 'tab:green']

for i, (name, data) in enumerate(titles):
    axes[i].plot(data, 'o-', color=colors[i], markersize=4)
    axes[i].axhline(target, color='red', linestyle='--', alpha=0.6, label='Target')
    axes[i].set_title(f"{name} Convergence")
    axes[i].set_xlabel("Iteration")
    if i == 0: axes[i].set_ylabel("Apogee (m)")
    axes[i].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('convergence_plot.png', dpi=300) # Save for the PDF script
plt.show()