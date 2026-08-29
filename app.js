import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.28.0/full/pyodide.mjs";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.28.0/full/";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let pyodide = null;
let currentFile = null;
let currentFileBytes = null;
const charts = [];

function log(message) {
  const el = $("#log");
  el.textContent += `${message}\n`;
  el.scrollTop = el.scrollHeight;
}

function clearCharts(){ while(charts.length){ charts.pop().destroy(); } }
function fmt(x, digits=3){ return Number.isFinite(Number(x)) ? Number(x).toFixed(digits) : "—"; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }

async function loadText(path){
  const response = await fetch(path);

  if(!response.ok){
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function pyExec(code){
  return await pyodide.runPythonAsync(`import json
${code}`);
}

async function installSource(name, source){
  pyodide.globals.set(name, source);
  await pyExec(`exec(${name}, globals())`);
}

function saveCurrentFileToPyodide(){
  if(!pyodide || !currentFileBytes){
    return false;
  }

  try{
    pyodide.FS.mkdirTree("/content");
  }catch(_){
    // Directory already exists.
  }

  pyodide.FS.writeFile("/content/ORI.csv",currentFileBytes);
  return true;
}

function setFileLoadedStatus(file){
  $("#file-status").innerHTML=`<b>${escapeHtml(file.name)}</b> loaded as <code>/content/ORI.csv</code>`;
}

async function init(){
  try{
    pyodide = await loadPyodide({indexURL:PYODIDE_INDEX});
    $("#runtime-status").textContent = "Python engine ready";
    log("Pyodide ready. Loading scientific Python packages used by the original simulations…");

    const sources = await Promise.all([
      loadText("source/EML26_Base_Sim.py"),
      loadText("source/SITLSim_2026_core_browser.py"),
      loadText("browser_adapter.py")
    ]);

    // Browser/Colab bridge: the original source checks for 'google.colab' to choose /content/ORI.csv.
    // We provide only that module marker; the simulation logic itself is unchanged.
    await pyExec(`import sys, types
sys.modules.setdefault('google.colab', types.ModuleType('google.colab'))`);

    await pyodide.loadPackagesFromImports(sources[0]);
    await pyodide.loadPackagesFromImports(sources[1]);

    // Both original simulation programs define run_simulation(). Keep separate aliases
    // so the UI can call the correct original program instead of one overwriting the other.
    await installSource("BASE_SOURCE", sources[0]);
    await pyExec("BASE_RUN_SIMULATION = run_simulation");

    await installSource("SITL_SOURCE", sources[1]);
    await pyExec("SITL_RUN_SIMULATION = run_simulation");

    // browser_adapter.py contains only the UI plumbing and optimizer wrapper.
    // The original optimizer source is intentionally NOT executed here because the
    // notebook contains top-level setup/run code that expects UI variables such as kp_low.
    await installSource("ADAPTER_SOURCE", sources[2]);

    if(currentFile && saveCurrentFileToPyodide()){
      setFileLoadedStatus(currentFile);
      log(`Loaded ${currentFile.name} (${currentFileBytes.byteLength.toLocaleString()} bytes) as /content/ORI.csv.`);
      log("Simulation source loaded. Choose a program and run it when ready.");
    }else{
      log("Simulation source loaded. Upload an OpenRocket CSV to begin.");
    }
  }catch(err){
    console.error(err);
    $("#runtime-status").textContent="Engine failed";
    log("ERROR: "+err);
    $("#runtime-status").classList.add("error");
  }
}

function inputValue(panel,key){
  const el = panel.querySelector(`[data-key="${key}"]`);
  if(!el) return undefined;
  return el.type === "number" ? Number(el.value) : el.value;
}

function collect(panelId, keys){
  const panel=$(panelId);
  const out={};
  for(const k of keys) out[k]=inputValue(panel,k);
  return out;
}

function resolveRunUntil(panel, key){
  const sel=panel.querySelector(`[data-key="run_until"]`);
  if(sel.value === "numeric") return `__NUM__${panel.querySelector(key).value}`;
  return sel.value;
}

function setRunUntilVisibility(){
  for(const panel of [$("#panel-base"),$("#panel-sitl")]){
    const sel=panel.querySelector(`[data-key="run_until"]`);
    const time=panel.querySelector(panel.id==="panel-base"?"#base-run-time":"#sitl-run-time");
    time.classList.toggle("hidden",sel.value!=="numeric");
  }
}

$("#ori-file").addEventListener("change", async e=>{
  const file=e.target.files[0];
  if(!file) return;

  currentFile=file;
  currentFileBytes=new Uint8Array(await file.arrayBuffer());

  if(!pyodide){
    $("#file-status").textContent="Python engine is still loading. Your CSV will be installed automatically when it is ready…";
    return;
  }

  saveCurrentFileToPyodide();
  setFileLoadedStatus(file);
  log(`Loaded ${file.name} (${currentFileBytes.byteLength.toLocaleString()} bytes) as /content/ORI.csv.`);
});

$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');

  $$('.app-panel').forEach(x=>x.classList.remove('active'));
  $("#panel-"+btn.dataset.tab).classList.add('active');
}));

$$('[data-key="run_until"]').forEach(x=>x.addEventListener('change',setRunUntilVisibility));
$("#clear-log").onclick=()=>$("#log").textContent="";

function ensureFile(){
  if(!pyodide) throw new Error("The Python engine is not ready yet.");
  if(!currentFile) throw new Error("Upload the OpenRocket CSV first. The site will save it internally as ORI.csv.");
}

function busy(button,b){
  button.disabled=b;
  button.textContent=b?"Running…":button.dataset.label;
}

function showError(container,err){
  container.innerHTML=`<div class="error"><b>Simulation error</b><br><pre>${escapeHtml(err?.message||String(err))}</pre></div>`;
  log("ERROR: "+(err?.stack||err));
}

function makeChart(container, labels, datasets, title, yLabel){
  const card=document.createElement('div');
  card.className='chart-card';

  const h=document.createElement('h3');
  h.textContent=title;
  card.appendChild(h);

  const wrap=document.createElement('div');
  wrap.className='chart-wrap';

  const canvas=document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);
  container.appendChild(card);

  const chart=new Chart(canvas,{
    type:'line',
    data:{
      labels,
      datasets:datasets.map(d=>({
        label:d.label,
        data:d.data,
        borderWidth:2,
        pointRadius:0,
        tension:.15
      }))
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{
        mode:'index',
        intersect:false
      },
      scales:{
        x:{
          title:{
            display:true,
            text:'Time (s)'
          }
        },
        y:{
          title:{
            display:true,
            text:yLabel||''
          }
        }
      }
    }
  });

  charts.push(chart);
}

function makePlotSelector(container, rows, plots){
  const select=document.createElement('select');
  select.className='plot-select';

  for(const [key,p] of Object.entries(plots)){
    const o=document.createElement('option');
    o.value=key;
    o.textContent=p.title;
    select.appendChild(o);
  }

  const holder=document.createElement('div');
  container.append(select,holder);

  function draw(){
    holder.innerHTML='';
    const p=plots[select.value];

    makeChart(
      holder,
      rows.map(r=>r['time (s)']),
      p.datasets.map(d=>({
        label:d.label,
        data:rows.map(r=>r[d.key])
      })),
      p.title,
      p.y
    );
  }

  select.onchange=draw;
  draw();
}

$("#run-base").onclick=async()=>{
  const button=$("#run-base");
  button.dataset.label="Run EML26 Base";
  busy(button,true);

  const out=$("#base-results");
  out.innerHTML='';
  clearCharts();

  try{
    ensureFile();

    const panel=$("#panel-base");
    const p=collect(
      "#panel-base",
      ['target_height','theta0','lrod_h','base_wind','step']
    );

    p.run_until=resolveRunUntil(panel,'#base-run-time');

    log("Running EML26 Base with the original simulation core…");

    pyodide.globals.set(
      "UI_PARAMS_JSON",
      JSON.stringify(p)
    );

    const raw=await pyExec(
      "json.dumps(run_base_ui(json.loads(UI_PARAMS_JSON)))"
    );

    const r=JSON.parse(raw);

    out.innerHTML=`
      <div class="metric-grid">
        <div class="metric">
          <div class="label">Simulated apogee</div>
          <div class="value">${fmt(r.apogee,2)} m</div>
        </div>

        <div class="metric">
          <div class="label">Flight time</div>
          <div class="value">${fmt(r.flight_time,2)} s</div>
        </div>

        <div class="metric">
          <div class="label">Recovery deployment</div>
          <div class="value">${r.chute_dep_t==null?'—':fmt(r.chute_dep_t,2)+' s'}</div>
        </div>

        <div class="metric">
          <div class="label">Rows shown</div>
          <div class="value">${r.rows.length}</div>
        </div>
      </div>
    `;

    const plotWrap=document.createElement('div');
    out.appendChild(plotWrap);

    makePlotSelector(plotWrap,r.rows,{
      velocity_altitude:{
        title:'Velocity and Altitude',
        y:'Velocity / Altitude',
        datasets:[
          {key:'y velocity (m/s)',label:'Velocity'},
          {key:'altitude (m)',label:'Altitude'}
        ]
      },

      horizontal:{
        title:'Horizontal Displacement',
        y:'Horizontal Position (m)',
        datasets:[
          {key:'horizontal displacement (m)',label:'x Position'}
        ]
      },

      pitch:{
        title:'Pitch',
        y:'Pitch (°)',
        datasets:[
          {key:'Pitch (°)',label:'Pitch'}
        ]
      },

      aoa:{
        title:'Angle of Attack',
        y:'AoA (°)',
        datasets:[
          {key:'AoA (°)',label:'AoA'}
        ]
      },

      drag:{
        title:'Total Drag Force',
        y:'Drag Force (N)',
        datasets:[
          {key:'Fd (N)',label:'Drag Force'}
        ]
      },

      mass:{
        title:'Mass',
        y:'Mass (kg)',
        datasets:[
          {key:'mass (kg)',label:'Mass'}
        ]
      }
    });

    log(`EML26 Base finished: ${r.apogee.toFixed(2)} m apogee.`);

  }catch(e){
    showError(out,e);
  }finally{
    busy(button,false);
  }
};

$("#run-sitl").onclick=async()=>{
  const button=$("#run-sitl");
  button.dataset.label="Run SITLSim 2026";
  busy(button,true);

  const out=$("#sitl-results");
  out.innerHTML='';
  clearCharts();

  try{
    ensureFile();

    const panel=$("#panel-sitl");

    const keys=[
      'target_height',
      'theta0',
      'lrod_h',
      'base_wind',
      'step',
      'PID_TOGGLE',
      'ctrl_kp',
      'ctrl_kd',
      'ctrl_ki',
      'ctrl_imu_error',
      'ctrl_imu_delay',
      'ctrl_baro_error',
      'ctrl_baro_delay',
      'ctrl_sd_delay',
      'ctrl_compute_delay',
      'servo_speed',
      'brakes_max_A',
      'servo_max_angle',
      'brake_angle_cmd_expr',
      'brake_angle_to_area_expr',
      'brake_area_to_cd_expr'
    ];

    const p=collect("#panel-sitl",keys);
    p.run_until=resolveRunUntil(panel,'#sitl-run-time');

    log("Running SITLSim 2026 with the original simulation core…");

    pyodide.globals.set(
      "UI_PARAMS_JSON",
      JSON.stringify(p)
    );

    const raw=await pyExec(
      "json.dumps(run_sitl_ui(json.loads(UI_PARAMS_JSON)))"
    );

    const r=JSON.parse(raw);

    out.innerHTML=`
      <div class="metric-grid">

        <div class="metric">
          <div class="label">Simulated apogee</div>
          <div class="value">${fmt(r.apogee,2)} m</div>
        </div>

        <div class="metric">
          <div class="label">Data rows</div>
          <div class="value">${r.rows.length}</div>
        </div>

        <div class="metric">
          <div class="label">PID</div>
          <div class="value">${escapeHtml(p.PID_TOGGLE)}</div>
        </div>

        <div class="metric">
          <div class="label">Target</div>
          <div class="value">${fmt(p.target_height,2)} m</div>
        </div>

      </div>
    `;

    const plotWrap=document.createElement('div');
    out.appendChild(plotWrap);

    makePlotSelector(plotWrap,r.rows,{

      velocity_altitude:{
        title:'Velocity and Altitude',
        y:'Value',
        datasets:[
          {key:'velocity (m/s)',label:'Velocity'},
          {key:'altitude (m)',label:'Altitude'}
        ]
      },

      horizontal:{
        title:'Horizontal Displacement',
        y:'Horizontal Position (m)',
        datasets:[
          {key:'horizontal displacement (m)',label:'x Position'}
        ]
      },

      pitch:{
        title:'Pitch',
        y:'Pitch (°)',
        datasets:[
          {key:'Pitch (°)',label:'Pitch'}
        ]
      },

      aoa:{
        title:'Angle of Attack',
        y:'AoA (°)',
        datasets:[
          {key:'AoA (°)',label:'AoA'}
        ]
      },

      drag:{
        title:'Total Drag Force',
        y:'Drag Force (N)',
        datasets:[
          {key:'Fd (N)',label:'Drag Force'}
        ]
      },

      prediction:{
        title:'Avionics Apogee Prediction vs Altitude',
        y:'m',
        datasets:[
          {key:'Apogee Predict (m)',label:'Prediction'},
          {key:'altitude (m)',label:'Altitude'}
        ]
      },

      imu:{
        title:'IMU Acceleration Data',
        y:'Controller values',
        datasets:[
          {key:'Controller ay',label:'Controller ay'},
          {key:'Controller vy',label:'Controller vy'}
        ]
      },

      baro:{
        title:'Barometer Data',
        y:'Controller values',
        datasets:[
          {key:'Controller y',label:'Controller y'},
          {key:'Controller theta',label:'Controller theta'}
        ]
      },

      prediction_error:{
        title:'Apogee Prediction Error',
        y:'m',
        datasets:[
          {key:'Apogee Predict (m)',label:'Prediction'}
        ]
      },

      pd_error:{
        title:'Proportional Error',
        y:'m',
        datasets:[
          {key:'PD error',label:'PD Error'}
        ]
      },

      pd_de:{
        title:'Change in Proportional Error',
        y:'m/s',
        datasets:[
          {key:'PD dE',label:'dE'}
        ]
      },

      brake_needed:{
        title:'Brake Area and Angle Needed',
        y:'Area / angle',
        datasets:[
          {key:'brake area needed',label:'Area Needed'},
          {key:'brake angle needed',label:'Angle Needed'}
        ]
      },

      servo_area:{
        title:'Calculated vs Actual Servo Position',
        y:'m²',
        datasets:[
          {key:'ctrl servo pos (m^2)',label:'Controller'},
          {key:'actual servo pos (m^2)',label:'Actual'}
        ]
      },

      servo_angle:{
        title:'Actual Servo Position',
        y:'°',
        datasets:[
          {key:'actual servo pos (°)',label:'Servo Angle'}
        ]
      }

    });

    const dl=document.createElement('div');

    dl.innerHTML=`
      <button class="download-btn" id="download-sitl">
        Download flight_data_results.csv
      </button>
    `;

    out.prepend(dl);

    $("#download-sitl").onclick=()=>{
      downloadCsv(r.rows,'flight_data_results.csv');
    };

    log(`SITLSim finished: ${r.apogee.toFixed(2)} m apogee.`);

  }catch(e){
    showError(out,e);
  }finally{
    busy(button,false);
  }
};

function downloadCsv(rows,name){
  if(!rows.length)return;

  const cols=Object.keys(rows[0]);

  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;

  const csv=[
    cols.map(esc).join(','),
    ...rows.map(r=>cols.map(c=>esc(r[c])).join(','))
  ].join('\n');

  const a=document.createElement('a');
  a.href=URL.createObjectURL(
    new Blob([csv],{type:'text/csv'})
  );
  a.download=name;
  a.click();

  URL.revokeObjectURL(a.href);
}

function downloadText(text,name,type='application/json'){
  const a=document.createElement('a');

  a.href=URL.createObjectURL(
    new Blob([text],{type})
  );

  a.download=name;
  a.click();

  URL.revokeObjectURL(a.href);
}

$("#run-optimizer").onclick=async()=>{
  const button=$("#run-optimizer");
  button.dataset.label="Run Optimizer";
  busy(button,true);

  const out=$("#optimizer-results");
  out.innerHTML='';
  clearCharts();

  try{
    ensureFile();

    const p=collect(
      "#panel-optimizer",
      [
        'target',
        'm_init',
        'kp_low',
        'kp_high',
        'kd_low',
        'kd_high',
        'ki_low',
        'ki_high',
        'iterations'
      ]
    );

    log(
      `Running optimizer: ${p.iterations} iterations × 3 gain searches, each using the original SITL simulation…`
    );

    pyodide.globals.set(
      "UI_PARAMS_JSON",
      JSON.stringify(p)
    );

    const raw=await pyExec(
      "json.dumps(run_optimizer_ui(json.loads(UI_PARAMS_JSON)))"
    );

    const r=JSON.parse(raw);

    out.innerHTML=`
      <div class="metric-grid">

        <div class="metric">
          <div class="label">Best Kp</div>
          <div class="value">${r.best_kp.toFixed(10)}</div>
        </div>

        <div class="metric">
          <div class="label">Best Kd</div>
          <div class="value">${r.best_kd.toFixed(10)}</div>
        </div>

        <div class="metric">
          <div class="label">Best Ki</div>
          <div class="value">${r.best_ki.toFixed(10)}</div>
        </div>

        <div class="metric">
          <div class="label">Final apogee</div>
          <div class="value">${fmt(r.final_apogee,3)} m</div>
        </div>

      </div>
    `;

    const chartWrap=document.createElement('div');
    out.appendChild(chartWrap);

    makeChart(
      chartWrap,
      r.kp_apo_hist.map((_,i)=>i+1),
      [
        {
          label:'Kp search apogee',
          data:r.kp_apo_hist
        },
        {
          label:'Target',
          data:r.kp_apo_hist.map(()=>r.target)
        }
      ],
      'Kp Convergence',
      'Apogee (m)'
    );

    makeChart(
      chartWrap,
      r.kd_apo_hist.map((_,i)=>i+1),
      [
        {
          label:'Kd search apogee',
          data:r.kd_apo_hist
        },
        {
          label:'Target',
          data:r.kd_apo_hist.map(()=>r.target)
        }
      ],
      'Kd Convergence',
      'Apogee (m)'
    );

    makeChart(
      chartWrap,
      r.ki_apo_hist.map((_,i)=>i+1),
      [
        {
          label:'Ki search apogee',
          data:r.ki_apo_hist
        },
        {
          label:'Target',
          data:r.ki_apo_hist.map(()=>r.target)
        }
      ],
      'Ki Convergence',
      'Apogee (m)'
    );

    const dl=document.createElement('div');

    dl.innerHTML=`
      <button class="download-btn" id="download-opt">
        Download optimizer results JSON
      </button>
    `;

    out.prepend(dl);

    $("#download-opt").onclick=()=>{
      downloadText(
        JSON.stringify(r,null,2),
        'PID_Optimization_Results.json'
      );
    };

    log(
      `Optimizer finished. Final apogee: ${r.final_apogee.toFixed(3)} m. Total optimization time: ${r.total_duration.toFixed(2)} s.`
    );

  }catch(e){
    showError(out,e);
  }finally{
    busy(button,false);
  }
};

setRunUntilVisibility();
init();
