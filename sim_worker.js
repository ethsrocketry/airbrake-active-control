import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.28.0/full/pyodide.mjs";

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.28.0/full/";
let pyodide = null;

async function pyExec(code, globals={}){
  for(const [key,value] of Object.entries(globals)){
    pyodide.globals.set(key, value);
  }
  return await pyodide.runPythonAsync(`import json\n${code}`);
}

async function installSource(name, source){
  await pyExec(`exec(${JSON.stringify(source)}, globals())`);
}

async function init(sources){
  pyodide = await loadPyodide({indexURL:PYODIDE_INDEX});
  await pyExec(`import sys, types\nsys.modules.setdefault('google.colab', types.ModuleType('google.colab'))`);
  await pyodide.loadPackagesFromImports(sources.base);
  await pyodide.loadPackagesFromImports(sources.sitl);
  await installSource("BASE_SOURCE", sources.base);
  await pyExec("BASE_RUN_SIMULATION = run_simulation");
  await installSource("SITL_SOURCE", sources.sitl);
  await pyExec("SITL_RUN_SIMULATION = run_simulation");
  await installSource("ADAPTER_SOURCE", sources.adapter);
}

function writeOri(bytes){
  try{ pyodide.FS.mkdirTree("/content"); }catch(_){}
  pyodide.FS.writeFile("/content/ORI.csv", new Uint8Array(bytes));
}

self.onmessage=async event=>{
  const {id,type,payload}=event.data;
  try{
    if(type === 'init'){
      await init(payload.sources);
      self.postMessage({id, ok:true});
    }else if(type === 'writeFile'){
      writeOri(payload.bytes);
      self.postMessage({id, ok:true});
    }else if(type === 'runPython'){
      const result=await pyExec(payload.code, payload.globals || {});
      self.postMessage({id, ok:true, result});
    }else{
      throw new Error(`Unknown worker message: ${type}`);
    }
  }catch(error){
    self.postMessage({id, ok:false, error:error?.stack || error?.message || String(error)});
  }
};
