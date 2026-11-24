/**
 * Opt-in Linux Electron performance probe.
 * Isolates SQLite, backups and Chromium profiles under /tmp; never touches the
 * operator's own user data. Does not run release/verify suites.
 *
 *   node scripts/benchmark-desktop-runtime.mjs --runs=5
 *   node scripts/benchmark-desktop-runtime.mjs --runs=1 --probe
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cpus, tmpdir, loadavg, freemem } from "node:os";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";
import { getLocalElectronExecutable } from "./test-helpers/local-electron.mjs";
import { createSmokeSetupInput } from "./test-helpers/desktop-setup.mjs";

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/benchmark-desktop-runtime.mjs [--runs=5] [--probe] [--diagnose-idle]");
  process.exit(0);
}
const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../apps/desktop-app/dist-electron/database.js");
const root = resolve(".");
const app = join(root, "apps/desktop-app");
const options = {
  runs: Math.max(1, Math.min(10, Number(process.argv.find(arg => arg.startsWith("--runs="))?.split("=")[1] || 5))),
  probe: process.argv.includes("--probe"),
  diagnose: process.argv.includes("--diagnose-idle")
};
const hz = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim());
const working = mkdtempSync(join(tmpdir(), "yardimci-electron-performance-"));
const reportFolder = join(root, "artifacts", "verify", "runtime-performance");
mkdirSync(reportFolder, { recursive: true });
const results = { name: "yardimci-electron-runtime", version: "2.5.0", timestamp: new Date().toISOString(),
  platform: process.platform, mode: "unpackaged Linux Electron, isolated temp DB, Xvfb, CDP",
  runCount: options.runs, cpuLogical: cpus().length, memoryAvailableMb: +(freemem()/1048576).toFixed(1),
  machineLoadStart: loadavg(), fresh: [], warm: [], workload: null, notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = values => values.length ? [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)] : null;

function createData(name) {
  const base=join(working,name), data=join(base,"data"), backup=join(base,"backup"), profile=join(base,"chromium");
  mkdirSync(data,{recursive:true});
  const db=new DesktopDatabase({appPath:app,userDataPath:data,backupPath:backup});
  try {
    db.initialize();
    const save=db.saveInitialSetup(createSmokeSetupInput({
      businessName:"Performans Test İşletmesi",profileId:"market",phone:"+905551111111",whatsapp:"",
      webModuleUrl:"",syncSecret:"",autoSyncEnabled:false,localNetworkEnabled:false,
      servicePreferences:{android:false,whatsapp:false}
    }));
    assert.equal(save.ok,true,save.message);
  } finally {db.close();}
  return {base,data,backup,profile};
}
function processSample(group) {
  let ticks=0, rssKb=0, pssKb=0;const types={}, processes=[];
  for (const name of readdirSync("/proc")) {
    if(!/^\d+$/.test(name)) continue;
    try{
      const pid=Number(name), raw=readFileSync(`/proc/${pid}/stat`,"utf8");
      const vals=raw.slice(raw.lastIndexOf(")") + 2).trim().split(/\s+/);
      if(Number(vals[2])!==group) continue; // process group
      const ut=Number(vals[11]), st=Number(vals[12]);
      const status=readFileSync(`/proc/${pid}/status`,"utf8");
      const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]||0);
      let pss=0;
      try {pss=Number(readFileSync(`/proc/${pid}/smaps_rollup`,"utf8").match(/^Pss:\s+(\d+)/m)?.[1]||0);}catch{}
      let cmdline="";try{cmdline=readFileSync(`/proc/${pid}/cmdline`,"utf8").replaceAll("\0"," ");}catch{}
      const kind=cmdline.includes("--type=renderer")?"renderer":cmdline.includes("--type=gpu-process")?"gpu":
        cmdline.includes("--type=utility")?"utility":cmdline.includes("--type=zygote")?"zygote":
        cmdline.includes("electron/dist/electron")?"main":
        cmdline.includes("Xvfb")?"xvfb":"launcher";
      const info=types[kind]||{count:0,rssMb:0,pssMb:0};
      info.count++;info.rssMb+=rss/1024;info.pssMb+=pss/1024;types[kind]=info;
      ticks+=ut+st;rssKb+=rss;pssKb+=pss;
      processes.push({pid,kind,ticks:ut+st,rssMb:+(rss/1024).toFixed(1),pssMb:+(pss/1024).toFixed(1)});
    }catch{}
  }
  for(const row of Object.values(types)){row.rssMb=+row.rssMb.toFixed(1);row.pssMb=+row.pssMb.toFixed(1);}
  return {at:performance.now(),ticks,groupProcesses:processes.length,rssMb:+(rssKb/1024).toFixed(1),
    pssMb:+(pssKb/1024).toFixed(1),types,processes};
}
function cpuPercent(a,b){
  const secs=(b.at-a.at)/1000;
  return +(100*(b.ticks-a.ticks)/hz/secs).toFixed(2);
}
function cpuByKind(a,b) {
  const secs=(b.at-a.at)/1000;
  const old=new Map(a.processes.map(p=>[p.pid,p.ticks]));
  const totals={};
  for(const p of b.processes) {
    const delta=p.ticks-(old.get(p.pid)??p.ticks);
    totals[p.kind]=(totals[p.kind]??0)+delta;
  }
  return Object.fromEntries(Object.entries(totals).map(([kind,ticks])=>[kind,+(ticks/hz/secs*100).toFixed(2)]));
}
async function rendererMetrics(page,collect=false){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if(collect){await cdp.send("HeapProfiler.enable");await cdp.send("HeapProfiler.collectGarbage");await sleep(250);}
  const metrics=(await cdp.send("Performance.getMetrics")).metrics;
  await cdp.detach();
  return Object.fromEntries(metrics.filter(x=>["JSHeapUsedSize","JSHeapTotalSize","Nodes","Documents","TaskDuration","LayoutCount","RecalcStyleCount"].includes(x.name))
    .map(x=>[x.name,x.name.includes("Size")?+(x.value/1048576).toFixed(2):x.value]));
}
function freePort(){
  return new Promise((resolvePort,reject)=>{
    import("node:net").then(({createServer})=>{const srv=createServer();
      srv.once("error",reject);srv.listen(0,"127.0.0.1",()=>{const port=srv.address().port;srv.close(()=>resolvePort(port));});
    }).catch(reject);
  });
}
async function launch(location) {
  const port=await freePort();
  const env={...process.env,YA_DESKTOP_DATA_DIR:location.data,YA_DESKTOP_BACKUP_DIR:location.backup,
    XDG_SESSION_TYPE:"x11",ELECTRON_DISABLE_SECURITY_WARNINGS:"1"};
  for(const key of ["VITE_DEV_SERVER_URL","WAYLAND_DISPLAY","WAYLAND_SOCKET","ELECTRON_OZONE_PLATFORM_HINT","ELECTRON_RUN_AS_NODE"])delete env[key];
  const args=["-a",getLocalElectronExecutable(),`--remote-debugging-port=${port}`,"--ozone-platform=x11",
    `--user-data-dir=${location.profile}`,app,"--no-sandbox"];
  const before=performance.now();
  const child=spawn("xvfb-run",args,{cwd:root,env,stdio:["ignore","pipe","pipe"],detached:true});
  let stderr="",browser=null;
  child.stderr?.on("data",chunk=>stderr=(stderr+chunk.toString()).slice(-8000));
  const deadline=before+25000;
  try {
    while(!browser&&performance.now()<deadline){
      if(child.exitCode!==null)throw Error("Electron exited early: "+stderr);
      try {browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:850});}
      catch {await sleep(120);}
    }
    assert.ok(browser,"CDP timeout: "+stderr);
    let page;
    while(!page&&performance.now()<deadline){
      page=browser.contexts().flatMap(context=>context.pages()).find(p=>p.url().includes("dist-renderer/index.html"));
      if(!page)await sleep(120);
    }
    assert.ok(page,"Renderer page not found: "+stderr);
    await page.locator(".sidebar-primary-nav").waitFor({state:"visible",timeout:12000});
    await page.locator(".dashboard-page").waitFor({state:"visible",timeout:12000});
    const readyMs=+(performance.now()-before).toFixed(1);
    const navigation=await page.evaluate(()=>({domContentLoaded: performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd||0,
      loaded: performance.getEntriesByType("navigation")[0]?.loadEventEnd||0}));
    return {child,browser,page,group:child.pid,readyMs,navigation,stderr:()=>stderr};
  } catch(error){
    try{await browser?.close()}catch{}
    await terminate(child);
    throw error;
  }
}
async function terminate(child){
  if(!child?.pid)return;
  try{process.kill(-child.pid,"SIGTERM")}catch{}
  await sleep(300);
  try{process.kill(-child.pid,"SIGKILL")}catch{}
}
async function close(instance){
  try{await instance.browser.close()}catch{}
  await terminate(instance.child);
}
async function benchOpen(location,kind,index){
  const i=await launch(location);
  try {
    const snap=processSample(i.group);
    const metric=await rendererMetrics(i.page);
    const entry={round:index,readyMs:i.readyMs,domContentLoadedMs:+i.navigation.domContentLoaded.toFixed(1),
      initialRendererHeapMb:metric.JSHeapUsedSize,initialPssMb:snap.pssMb,
      initialRssMb:snap.rssMb,initialAppPssMb:+(snap.pssMb-(snap.types.xvfb?.pssMb??0)).toFixed(1),processes:snap.types};
    results[kind].push(entry);
    console.log(kind,index,JSON.stringify({readyMs:entry.readyMs,heapMb:entry.initialRendererHeapMb,pssMb:entry.initialPssMb}));
  } finally{await close(i);}
}
async function route(i,label,selector){
  const t=performance.now();
  await i.page.getByRole("navigation",{name:label === "Ayarlar" ? "Uygulama ayarları" : "Masaüstü menü"})
    .getByRole("button",{name:label,exact:true}).click();
  await i.page.locator(selector).first().waitFor({state:"visible",timeout:15000});
  await i.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return +(performance.now()-t).toFixed(1);
}
async function runWorkload(location){
  const i=await launch(location);
  const w={startupMs:i.readyMs,clicks:[],pages:[],errors:[]};
  i.page.on("pageerror",error=>w.errors.push(error.message));
  try{
    w.start=processSample(i.group);
    w.rendererStart=await rendererMetrics(i.page,true);
    await sleep(options.probe?1000:4500); // exclude early startup settles from idle sample
    const idleStart=processSample(i.group);
    await sleep(options.probe?2500:10000);
    const idleEnd=processSample(i.group);
    w.idle={seconds:+((idleEnd.at-idleStart.at)/1000).toFixed(2),cpuPct:cpuPercent(idleStart,idleEnd),cpuByKind:cpuByKind(idleStart,idleEnd),
      pssMb:idleEnd.pssMb,rssMb:idleEnd.rssMb,types:idleEnd.types};
    const actions=[["Satış",".market-page"],["Ana Ekran",".dashboard-page"],
      ["Müşteri İşleri",".customer-work-page-surface"],["Ana Ekran",".dashboard-page"],
      ["Takvim",".operation-calendar-page"],["Ana Ekran",".dashboard-page"],
      ["Ayarlar",".settings-workspace"],["Ana Ekran",".dashboard-page"]];
    const cpu0=processSample(i.group);
    w.cycles=[];
    for(let j=0;j<(options.probe?1:4);j++){
      for(const [label,selector] of actions){
        try{const elapsed=await route(i,label,selector);w.clicks.push({label,elapsed});}
        catch(err){w.errors.push(`${label}: ${String(err).slice(0,180)}`);throw err;}
      }
      const snap=processSample(i.group);
      const heap=await rendererMetrics(i.page,true);
      w.cycles.push({cycle:j+1,appPssMb:+(snap.pssMb-(snap.types.xvfb?.pssMb??0)).toFixed(1),
        rendererHeapMb:heap.JSHeapUsedSize,nodes:heap.Nodes});
    }
    const cpu1=processSample(i.group);
    w.active={seconds:+((cpu1.at-cpu0.at)/1000).toFixed(2),cpuPct:cpuPercent(cpu0,cpu1),cpuByKind:cpuByKind(cpu0,cpu1),
      pssMb:cpu1.pssMb,rssMb:cpu1.rssMb,types:cpu1.types};
    w.rendererAfterRoutes=await rendererMetrics(i.page,true);
    const afterIdleStart=processSample(i.group);
    await sleep(options.probe?1000:8000);
    const afterIdleEnd=processSample(i.group);
    w.idleAfterRoutes={seconds:+((afterIdleEnd.at-afterIdleStart.at)/1000).toFixed(2),
      cpuPct:cpuPercent(afterIdleStart,afterIdleEnd),cpuByKind:cpuByKind(afterIdleStart,afterIdleEnd),pssMb:afterIdleEnd.pssMb,
      appPssMb:+(afterIdleEnd.pssMb-(afterIdleEnd.types.xvfb?.pssMb??0)).toFixed(1)};
    w.rendererAfterRecovery=await rendererMetrics(i.page,true);
    w.after=processSample(i.group);
    w.deltaRendererHeapMb=+(w.rendererAfterRecovery.JSHeapUsedSize-w.rendererStart.JSHeapUsedSize).toFixed(2);
    w.deltaPssMb=+(w.after.pssMb-w.start.pssMb).toFixed(1);
    const groupBy=Map.groupBy(w.clicks,e=>e.label);
    w.routeMedianMs=Object.fromEntries([...groupBy].map(([label,list])=>[label,median(list.map(x=>x.elapsed))]));
    console.log("WORKLOAD",JSON.stringify({idle:w.idle,active:w.active,routeMedianMs:w.routeMedianMs,
      rendererStart:w.rendererStart,rendererEnd:w.rendererAfterRecovery,
      cycles:w.cycles,idleAfterRoutes:w.idleAfterRoutes,
      deltaRendererHeapMb:w.deltaRendererHeapMb,deltaPssMb:w.deltaPssMb,errors:w.errors}).slice(0,4000));
    return w;
  }finally{await close(i);}
}
async function diagnoseIdle(location) {
  const instance=await launch(location);
  const measurements=[];
  const measure=async(name, profileJs=false)=>{
    const cpuStart=processSample(instance.group);
    const cdp=profileJs ? await instance.page.context().newCDPSession(instance.page) : null;
    if(cdp){await cdp.send("Profiler.enable");await cdp.send("Profiler.setSamplingInterval",{interval:1000});await cdp.send("Profiler.start");}
    await sleep(8000);
    const cpuEnd=processSample(instance.group);
    let hotspots=[];
    if(cdp){
      const {profile}=await cdp.send("Profiler.stop");
      const counts=new Map();
      for(const sample of profile.samples??[])counts.set(sample,(counts.get(sample)??0)+1);
      hotspots=profile.nodes.map(node=>({id:node.id,func:node.callFrame.functionName,url:node.callFrame.url,
        samples:counts.get(node.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,12);
      await cdp.detach();
    }
    measurements.push({name,cpuPct:cpuPercent(cpuStart,cpuEnd),byKind:cpuByKind(cpuStart,cpuEnd),hotspots});
    console.log("IDLE_CASE",JSON.stringify(measurements.at(-1)));
  };
  try {
    await sleep(4000);
    await measure("dashboard-original",true);
    await instance.page.evaluate(()=>{document.documentElement.dataset.motion="reduced";});
    const cdp=await instance.page.context().newCDPSession(instance.page);
    await cdp.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    await sleep(1500);
    await measure("dashboard-reduced-motion");
    await instance.page.addStyleTag({content:"*,*::before,*::after{animation:none!important;transition:none!important;}"});
    await sleep(700);
    await measure("dashboard-css-animations-disabled");
    await instance.page.evaluate(()=>{document.querySelector(".nexa-habitat")?.style.setProperty("display","none");});
    await sleep(700);
    await measure("dashboard-nexa-hidden");
    await route(instance,"Satış",".market-page");
    await sleep(700);
    await measure("market-page");
    await route(instance,"Ayarlar",".settings-workspace");
    await sleep(700);
    await measure("settings-page");
  }finally{await close(instance);}
  const out=join(reportFolder,"desktop-idle-cpu.json");
  writeFileSync(out,JSON.stringify({timestamp:new Date().toISOString(),measurements},null,2)+"\n");
  console.log("IDLE_REPORT",out);
}

try{
  assert.equal(process.platform,"linux","Bench only supported on Linux");
  assert.ok(existsSync(join(app,"dist-renderer/index.html")),"Build renderer first");
  if (options.diagnose) {
    await diagnoseIdle(createData("idle-diagnosis"));
  } else {
  for(let index=0;index<options.runs;index++)await benchOpen(createData("fresh-"+index),"fresh",index+1);
  const warm=createData("warm-shared");
  await benchOpen(warm,"warm",0); // prime Chromium profile
  results.warm=[]; // discard priming
  for(let index=0;index<options.runs;index++)await benchOpen(warm,"warm",index+1);
  results.workload=await runWorkload(warm);
  results.summary={freshMedianMs:median(results.fresh.map(x=>x.readyMs)),
    warmMedianMs:median(results.warm.map(x=>x.readyMs)),
    freshMedianPssMb:median(results.fresh.map(x=>x.initialPssMb)),
    freshMedianAppPssMb:median(results.fresh.map(x=>x.initialAppPssMb)),
    warmMedianPssMb:median(results.warm.map(x=>x.initialPssMb)),
    warmMedianAppPssMb:median(results.warm.map(x=>x.initialAppPssMb)),
    freshMedianRendererHeapMb:median(results.fresh.map(x=>x.initialRendererHeapMb)),
    warmMedianRendererHeapMb:median(results.warm.map(x=>x.initialRendererHeapMb))};
  const out=join(reportFolder,"desktop-runtime.json");
  writeFileSync(out,JSON.stringify(results,null,2)+"\n");
  console.log("SUMMARY",JSON.stringify(results.summary));
  console.log("REPORT",out);
  }
}catch(error){results.notes.push("ERROR: "+String(error));const out=join(reportFolder,"desktop-runtime-partial.json");
  writeFileSync(out,JSON.stringify(results,null,2)+"\n");console.error(error);process.exitCode=1;
}finally{rmSync(working,{recursive:true,force:true});}
