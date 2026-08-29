const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let simWorker = null;
let workerReady = false;
let nextWorkerMessageId = 1;
const pendingWorkerMessages = new Map();
let currentFile = null;
let currentFileBytes = null;
const charts = [];
let progressTimer = null;

function log(message) {
  const el = $("#log");
  el.textContent += `${message}\n`;
  el.scrollTop = el.scrollHeight;
}

function clearCharts(){ while(charts.length){ charts.pop().destroy(); } }
function destroyChartsIn(element){
  for(let i=charts.length-1;i>=0;i--){
    const canvas=charts[i].canvas;
    if(element.contains(canvas)){
      charts[i].destroy();
      charts.splice(i,1);
    }
  }
}
function fmt(x, digits=3){ return Number.isFinite(Number(x)) ? Number(x).toFixed(digits) : "—"; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }

async function loadText(path){
  const response = await fetch(path);

  if(!response.ok){
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

function workerCall(type, payload={}){
  if(!simWorker){
    throw new Error("The simulation worker has not started yet.");
  }

  const id=nextWorkerMessageId++;

  return new Promise((resolve,reject)=>{
    pendingWorkerMessages.set(id,{resolve,reject});
    simWorker.postMessage({id,type,payload});
  });
}

async function pyExec(code, globals={}){
  return await workerCall('runPython',{code,globals});
}

async function saveCurrentFileToPyodide(){
  if(!workerReady || !currentFileBytes){
    return false;
  }

  await workerCall('writeFile',{bytes:currentFileBytes.buffer}, [currentFileBytes.buffer]);
  currentFileBytes=new Uint8Array(currentFileBytes);
  return true;
}

function setFileLoadedStatus(file){
  $("#file-status").innerHTML=`<b>${escapeHtml(file.name)}</b> loaded as <code>/content/ORI.csv</code>`;
}

async function init(){
  try{
    simWorker = new Worker("sim_worker.js", {type:"module"});
    simWorker.onmessage=event=>{
      const {id,ok,result,error}=event.data;
      const pending=pendingWorkerMessages.get(id);
      if(!pending) return;
      pendingWorkerMessages.delete(id);
      if(ok){
        pending.resolve(result);
      }else{
        pending.reject(new Error(error));
      }
    };

    log("Starting background simulation worker so long runs do not freeze the page…");

    const sources = await Promise.all([
      loadText("source/EML26_Base_Sim.py"),
      loadText("source/SITLSim_2026_core_browser.py"),
      loadText("browser_adapter.py")
    ]);

    log("Worker ready. Loading scientific Python packages used by the original simulations…");

    await workerCall('init',{
      sources:{
        base:sources[0],
        sitl:sources[1],
        adapter:sources[2]
      }
    });

    workerReady = true;
    $("#runtime-status").textContent = "Python worker ready";

    if(currentFile && await saveCurrentFileToPyodide()){
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

  if(!workerReady){
    $("#file-status").textContent="Python engine is still loading. Your CSV will be installed automatically when it is ready…";
    return;
  }

  await saveCurrentFileToPyodide();
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
  if(!workerReady) throw new Error("The Python worker is not ready yet.");
  if(!currentFile) throw new Error("Upload the OpenRocket CSV first. The site will save it internally as ORI.csv.");
}

function busy(button,b){
  button.disabled=b;
  button.textContent=b?"Running…":button.dataset.label;
}

function startProgress(panel, label){
  stopProgress(panel);
  const card=panel.querySelector('.card');
  const progress=document.createElement('div');
  progress.className='sim-progress';
  progress.innerHTML=`
    <div class="progress-row">
      <span>${escapeHtml(label)}</span>
      <span class="progress-percent">0%</span>
    </div>
    <div class="progress-track"><div class="progress-fill"></div></div>
  `;
  card.appendChild(progress);

  const fill=progress.querySelector('.progress-fill');
  const pct=progress.querySelector('.progress-percent');
  let value=0;
  progressTimer=setInterval(()=>{
    value=Math.min(95,value+(value<70?4:1));
    fill.style.width=`${value}%`;
    pct.textContent=`${value}%`;
  },350);
}

function stopProgress(panel){
  if(progressTimer){
    clearInterval(progressTimer);
    progressTimer=null;
  }
  const existing=panel.querySelector('.sim-progress');
  if(existing){
    existing.querySelector('.progress-fill').style.width='100%';
    existing.querySelector('.progress-percent').textContent='100%';
    existing.remove();
  }
}

function showError(container,err){
  container.innerHTML=`<div class="error"><b>Simulation error</b><br><pre>${escapeHtml(err?.message||String(err))}</pre></div>`;
  log("ERROR: "+(err?.stack||err));
}

function makeChart(container, labels, datasets, title, yLabel, xLabel='Time (s)'){
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
            text:xLabel
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

function makeOptions(select, options, selected){
  select.innerHTML='';
  for(const option of options){
    const o=document.createElement('option');
    o.value=option;
    o.textContent=option;
    if(option===selected) o.selected=true;
    select.appendChild(o);
  }
}

function makeDatasetSelect(columns, selected){
  const select=document.createElement('select');
  select.className='dataset-select';
  makeOptions(select, columns, selected || columns[0]);
  return select;
}

function makeGraphDashboard(container, rows, plots, options={}){
  const xKey=options.xKey || 'time (s)';
  const labels=options.labels || rows.map(r=>r[xKey]);
  const columns=options.columns || (rows[0] ? Object.keys(rows[0]).filter(k=>k!==xKey) : []);
  const dashboard=document.createElement('div');
  dashboard.className='graph-dashboard';
  dashboard.innerHTML=`
    <div class="graph-toolbar">
      <div>
        <h3>Graphs</h3>
        <p>Add as many preset or custom graphs as you need. Graphs automatically wrap side-by-side and below each other.</p>
      </div>
      <div class="graph-actions">
        <select class="preset-select"></select>
        <button class="small-btn add-preset" type="button">Add preset graph</button>
        <button class="small-btn add-custom" type="button">Create custom graph</button>
      </div>
    </div>
    <div class="chart-grid"></div>
  `;
  container.appendChild(dashboard);

  const presetSelect=dashboard.querySelector('.preset-select');
  for(const [key,p] of Object.entries(plots)){
    const o=document.createElement('option');
    o.value=key;
    o.textContent=p.title;
    presetSelect.appendChild(o);
  }

  const grid=dashboard.querySelector('.chart-grid');

  function addGraph(config, custom=false){
    const card=document.createElement('div');
    card.className='graph-item';
    const tools=document.createElement('div');
    tools.className='graph-item-tools';
    tools.innerHTML='<button class="small-btn remove-graph" type="button">Remove</button>';
    card.appendChild(tools);

    if(custom){
      const builder=document.createElement('div');
      builder.className='custom-builder';
      const title=document.createElement('input');
      title.placeholder='Graph title';
      title.value=config.title || 'Custom Graph';
      const y=document.createElement('input');
      y.placeholder='Y-axis label';
      y.value=config.y || '';
      const first=makeDatasetSelect(columns, columns[0]);
      const second=makeDatasetSelect(['',...columns], '');
      builder.append('Title ',title,' Y label ',y,' Series 1 ',first,' Series 2 ',second);
      card.appendChild(builder);
      const redraw=()=>{
        const datasets=[first.value,second.value].filter(Boolean).map(key=>({key,label:key}));
        destroyChartsIn(chartHost);
        chartHost.innerHTML='';
        makeChart(chartHost, labels, datasets.map(d=>({label:d.label,data:rows.map(r=>r[d.key])})), title.value || 'Custom Graph', y.value, options.xLabel || xKey);
      };
      for(const el of [title,y,first,second]) el.addEventListener('input',redraw);
      for(const el of [first,second]) el.addEventListener('change',redraw);
      var chartHost=document.createElement('div');
      card.appendChild(chartHost);
      grid.appendChild(card);
      redraw();
    }else{
      const chartHost=document.createElement('div');
      card.appendChild(chartHost);
      grid.appendChild(card);
      makeChart(chartHost, labels, config.datasets.map(d=>({label:d.label,data:d.data || rows.map(r=>r[d.key])})), config.title, config.y, options.xLabel || xKey);
    }

    card.querySelector('.remove-graph').onclick=()=>{
      destroyChartsIn(card);
      card.remove();
    };
  }

  dashboard.querySelector('.add-preset').onclick=()=>addGraph(plots[presetSelect.value]);
  dashboard.querySelector('.add-custom').onclick=()=>addGraph({title:'Custom Graph'}, true);

  for(const key of Object.keys(plots).slice(0, options.initialCount || 2)){
    addGraph(plots[key]);
  }
}

$("#run-base").onclick=async()=>{
  const button=$("#run-base");
  button.dataset.label="Run EML26 Base";
  busy(button,true);
  startProgress($("#panel-base"), "Running EML26 Base simulation…");

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

    const raw=await pyExec(
      "json.dumps(run_base_ui(json.loads(UI_PARAMS_JSON)))",
      {UI_PARAMS_JSON:JSON.stringify(p)}
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

    makeGraphDashboard(plotWrap,r.rows,{
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
    stopProgress($("#panel-base"));
    busy(button,false);
  }
};

$("#run-sitl").onclick=async()=>{
  const button=$("#run-sitl");
  button.dataset.label="Run SITLSim 2026";
  busy(button,true);
  startProgress($("#panel-sitl"), "Running SITLSim 2026 simulation…");

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

    const raw=await pyExec(
      "json.dumps(run_sitl_ui(json.loads(UI_PARAMS_JSON)))",
      {UI_PARAMS_JSON:JSON.stringify(p)}
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

    makeGraphDashboard(plotWrap,r.rows,{

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
    stopProgress($("#panel-sitl"));
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


function makePdfDownload(text, name){
  const lines=text.split('\n');
  const objects=[];
  const safe=line=>String(line).replace(/[\\()]/g, ch=>`\\${ch}`);
  const stream=[
    'BT',
    '/F1 12 Tf',
    '72 760 Td',
    '14 TL',
    ...lines.flatMap((line,index)=>[`${index===0?'':'T*'} (${safe(line)}) Tj`]),
    'ET'
  ].join('\n');

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  let pdf='%PDF-1.4\n';
  const offsets=[0];
  objects.forEach((object,index)=>{
    offsets.push(pdf.length);
    pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;
  });
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<offsets.length;i++){
    pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  }
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadText(pdf,name,'application/pdf');
}

function optimizerReportText(r){
  const rows=(name,gains,apogees,time)=>[
    '',
    `${name} Optimization Detailed History - Search Duration: ${fmt(time,4)}s`,
    'Iter | Value | Apogee (m)',
    ...gains.map((gain,i)=>`${i+1} | ${Number(gain).toFixed(10)} | ${fmt(apogees[i],4)}`)
  ].join('\n');

  return [
    'PID Control System Optimization Report',
    'E-Town Rocket Bureau',
    `Generated: ${new Date().toLocaleString()}`,
    '',
    'FINAL OPTIMIZED CONSTANTS',
    '-------------------------',
    `Kp: ${Number(r.best_kp).toFixed(10)}`,
    `Kd: ${Number(r.best_kd).toFixed(10)}`,
    `Ki: ${Number(r.best_ki).toFixed(10)}`,
    '',
    `Final Apogee: ${fmt(r.final_apogee,4)} m`,
    `Target: ${fmt(r.target,4)} m`,
    `Total Sim Time: ${fmt(r.total_duration,4)}s`,
    rows('Kp', r.kp_hist, r.kp_apo_hist, r.kp_time),
    rows('Kd', r.kd_hist, r.kd_apo_hist, r.kd_time),
    rows('Ki', r.ki_hist, r.ki_apo_hist, r.ki_time)
  ].join('\n');
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
  startProgress($("#panel-optimizer"), "Running optimizer simulations…");

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
        'iterations',
        'compute_mode'
      ]
    );

    log(
      `Running optimizer in ${p.compute_mode === 'parallel' ? 'parallel browser-worker' : 'normal binary-search'} mode: ${p.iterations} iterations × 3 gain searches…`
    );

    const raw=await pyExec(
      "json.dumps(run_optimizer_ui(json.loads(UI_PARAMS_JSON)))",
      {UI_PARAMS_JSON:JSON.stringify(p)}
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

    const optimizerRows=r.kp_apo_hist.map((_,i)=>({
      iteration:i+1,
      'Kp search apogee':r.kp_apo_hist[i],
      'Kd search apogee':r.kd_apo_hist[i],
      'Ki search apogee':r.ki_apo_hist[i],
      Target:r.target
    }));

    makeGraphDashboard(
      chartWrap,
      optimizerRows,
      {
        kp:{
          title:'Kp Convergence',
          y:'Apogee (m)',
          datasets:[
            {key:'Kp search apogee',label:'Kp search apogee'},
            {key:'Target',label:'Target'}
          ]
        },
        kd:{
          title:'Kd Convergence',
          y:'Apogee (m)',
          datasets:[
            {key:'Kd search apogee',label:'Kd search apogee'},
            {key:'Target',label:'Target'}
          ]
        },
        ki:{
          title:'Ki Convergence',
          y:'Apogee (m)',
          datasets:[
            {key:'Ki search apogee',label:'Ki search apogee'},
            {key:'Target',label:'Target'}
          ]
        }
      },
      {xKey:'iteration', initialCount:3}
    );

    const dl=document.createElement('div');

    dl.innerHTML=`
      <button class="download-btn" id="download-opt">
        Download optimizer PDF report
      </button>
    `;

    out.prepend(dl);

    $("#download-opt").onclick=()=>{
      makePdfDownload(
        optimizerReportText(r),
        `PID_Optimization_Report_${new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')}.pdf`
      );
    };

    log(
      `Optimizer finished. Final apogee: ${r.final_apogee.toFixed(3)} m. Total optimization time: ${r.total_duration.toFixed(2)} s.`
    );

  }catch(e){
    showError(out,e);
  }finally{
    stopProgress($("#panel-optimizer"));
    busy(button,false);
  }
};

setRunUntilVisibility();
init();
