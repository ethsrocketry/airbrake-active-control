import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import datetime
import pandas as pd
from google.colab import files
import logging

# 1. Fix the Font Error: Use fonts actually installed on Colab
# DejaVu Sans is the Linux equivalent of Helvetica/Arial
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Liberation Sans', 'Ubuntu', 'sans-serif']

# Suppress font warnings from cluttering your Colab cell
logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)

# 2. Metadata & Filename
date_str = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
output_filename = f'PID_Optimization_Report_{datetime.datetime.now().strftime("%Y%m%d_%H%M")}.pdf'

# 3. Data Preparation (Assuming your optimizer variables exist)
kp_df = pd.DataFrame({'Iter': range(1, 21), 'Value': kp_hist, 'Apogee (m)': kp_apo_hist})
kd_df = pd.DataFrame({'Iter': range(1, 21), 'Value': kd_hist, 'Apogee (m)': kd_apo_hist})
ki_df = pd.DataFrame({'Iter': range(1, 21), 'Value': ki_hist, 'Apogee (m)': ki_apo_hist})

with PdfPages(output_filename) as pdf:

    # --- PAGE 1: TITLE PAGE (Letter Size) ---
    fig_title = plt.figure(figsize=(8.5, 11))
    fig_title.text(0.5, 0.65, "PID Control System Optimization Report",
                   ha='center', va='center', fontsize=22, fontweight='bold')
    fig_title.text(0.5, 0.58, "E-Town Rocket Bureau",
                   ha='center', va='center', fontsize=14, fontweight='bold')
    fig_title.text(0.5, 0.55, f"Generated on {date_str}",
                   ha='center', va='center', fontsize=11, fontstyle='italic')

    # BOXED CONSTANTS
    box_text = (f"FINAL OPTIMIZED CONSTANTS\n"
                f"{'-'*30}\n"
                f"Kp: {best_kp:.10f}\n"
                f"Kd: {best_kd:.10f}\n"
                f"Ki: {best_ki:.10f}\n\n"
                f"FINAL APOGEE: {final_apogee:.4f} m\n"
                f"TOTAL SIM TIME: {total_duration:.4f}s")

    fig_title.text(0.5, 0.35, box_text, ha='center', va='center', fontsize=13,
                   family='monospace', fontweight='bold',
                   bbox=dict(boxstyle='round,pad=1.5', facecolor='#F0F5FF', edgecolor='#003264', linewidth=1.5))

    pdf.savefig(fig_title)
    plt.close(fig_title)

    # --- PAGE 2: CONVERGENCE GRAPHS (Letter Size) ---
    fig_conv = plt.figure(figsize=(8.5, 11))
    axes = fig_conv.subplots(3, 1)

    data_sets = [('KP', kp_apo_hist, 'tab:blue'),
                 ('KD', kd_apo_hist, 'tab:orange'),
                 ('KI', ki_apo_hist, 'tab:green')]

    for i, (name, data, color) in enumerate(data_sets):
        axes[i].plot(data, 'o-', color=color, markersize=4)
        axes[i].axhline(target, color='red', linestyle='--', alpha=0.6)
        axes[i].set_title(f"{name} Convergence History", fontweight='bold')
        axes[i].set_ylabel("Apogee (m)")
        axes[i].grid(True, alpha=0.2)

    plt.xlabel("Iteration")
    fig_conv.tight_layout(pad=5.0) # Using fig_conv instead of plt for safer sizing

    pdf.savefig(fig_conv)
    plt.close(fig_conv)

    # --- PAGES 3-5: DATA TABLES (Letter Size) ---
    tables = [("Kp", kp_df, kp_time), ("Kd", kd_df, kd_time), ("Ki", ki_df, ki_time)]

    for name, df, dur in tables:
        fig_tab = plt.figure(figsize=(8.5, 11))
        ax_tab = fig_tab.add_subplot(111)
        ax_tab.axis('off')

        ax_tab.set_title(f"{name} Optimization Detailed History\nSearch Duration: {dur:.4f}s",
                         pad=30, fontweight='bold', fontsize=14)

        tab = ax_tab.table(cellText=df.values.round(10),
                           colLabels=df.columns,
                           loc='center',
                           cellLoc='center')

        tab.auto_set_font_size(False)
        tab.set_fontsize(10)
        tab.scale(1.1, 1.8)

        pdf.savefig(fig_tab, bbox_inches='tight')
        plt.close(fig_tab)

# Trigger Download
files.download(output_filename)