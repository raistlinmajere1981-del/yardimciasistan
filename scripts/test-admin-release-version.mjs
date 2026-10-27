import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require=createRequire(import.meta.url);
const { planReleaseVersion }=require("../apps/admin-control-center/dist-electron/electron/services/release-version-plan.js");
const { ReleaseRunner, planReleaseSteps }=require("../apps/admin-control-center/dist-electron/electron/services/release-runner.js");
const current={version:"2.0.5",androidVersionCode:9,webModuleVersion:"2.0.5"};

test("Release version plan increments Android code and optionally synchronizes web",()=>{
  const linked=planReleaseVersion({action:"version",version:"2.0.6",updateWebModule:true},current,"npm");
  assert.equal(linked.nextVersion,"2.0.6");
  assert.equal(linked.nextAndroidCode,10);
  assert.equal(linked.nextWebVersion,"2.0.6");
  assert.deepEqual(linked.steps.map(step=>step.args.slice(1)),[
    ["version:set","--","2.0.6"],["version:web:set","--","2.0.6"],["version:check"]
  ]);
  const separate=planReleaseVersion({action:"version",version:"2.1.0",updateWebModule:false},current,"npm");
  assert.equal(separate.nextWebVersion,"2.0.5");
  assert.deepEqual(separate.steps.map(step=>step.args[1]),["version:set","version:check"]);
});

test("Release version plan rejects unsafe, missing, downgrade and duplicate versions",()=>{
  for(const version of ["2.0.5","2.0.4","", "v2.0.6","2.0","2.0.6 --force","2.0.6; echo bad","1.0.999", "002.1.0", "2.0.6\nfoo"]){
    if(version==="1.0.999"){ assert.throws(()=>planReleaseVersion({action:"version",version,updateWebModule:true},current,"npm"));continue; }
    assert.throws(()=>planReleaseVersion({action:"version",version,updateWebModule:true},current,"npm"),version);
  }
  for(const invalid of [
    {action:"version",version:"2.0.6"},
    {action:"version",version:12,updateWebModule:true},
    {action:"version",version:"2.0.6",updateWebModule:"true"}
  ])assert.throws(()=>planReleaseVersion(invalid,current,"npm"));
  assert.throws(()=>planReleaseVersion({action:"version",version:"2.0.6",updateWebModule:true},
    {...current,webModuleVersion:"2.2.0"},"npm"),/Web modülü/);
  assert.throws(()=>planReleaseVersion({action:"version",version:"2.0.6",updateWebModule:true},
    {...current,androidVersionCode:2_100_000_000},"npm"),/Android/);
});

test("Release runner rejects unsafe version without touching files or starting any action",()=>{
  const root=mkdtempSync(join(tmpdir(),"ya-admin-version-"));
  try {
    const file=join(root,"product-version.json");
    const raw=JSON.stringify(current);
    writeFileSync(file,raw);
    const runner=new ReleaseRunner(root);
    assert.equal(runner.start({action:"version",version:"2.0.5",updateWebModule:true}).accepted,false);
    assert.equal(runner.start({action:"version",version:"2.0.4",updateWebModule:true}).accepted,false);
    assert.equal(runner.start({action:"version",version:"2.0.6;id",updateWebModule:true}).accepted,false);
    assert.equal(runner.getState().running,false);
    assert.equal(runner.getState().result,"idle");
    assert.equal(require("node:fs").readFileSync(file,"utf8"),raw);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test("Release runner executes version-only canonical steps without packaging or deployment", async()=>{
  const root=mkdtempSync(join(tmpdir(),"ya-admin-version-run-"));
  try {
    writeFileSync(join(root,"product-version.json"),JSON.stringify(current));
    writeFileSync(join(root,"package.json"),JSON.stringify({name:"fixture-version-workspace",private:true,scripts:{
      "version:set":"node stage.mjs set",
      "version:web:set":"node stage.mjs web",
      "version:check":"node stage.mjs check"
    }}));
    writeFileSync(join(root,"stage.mjs"),'import{appendFileSync}from"node:fs";appendFileSync("steps.log",process.argv[2]+"\\n");');
    const runner=new ReleaseRunner(root);
    const done=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Release runner timed out")),12000);
      runner.subscribe(state=>{
        if(state.startedAt&&!state.running){
          clearTimeout(timeout);
          resolve(state);
        }
      });
    });
    assert.equal(runner.start({action:"version",version:"2.0.6",updateWebModule:true}).accepted,true);
    const result=await done;
    assert.equal(result.result,"passed");
    assert.deepEqual(require("node:fs").readFileSync(join(root,"steps.log"),"utf8").trim().split("\n"),["set","web","check"]);
    assert.equal(require("node:fs").readFileSync(join(root,"product-version.json"),"utf8"),JSON.stringify(current),
      "only the canonical scripts write version metadata; the admin runner itself must not write it");
  } finally {rmSync(root,{recursive:true,force:true});}
});


test("Release package and combined deployment plans reuse canonical commands without pilot/Linux packaging",()=>{
  const packagePlan=planReleaseSteps("package");
  assert.deepEqual(packagePlan.map(step=>step.args),[["run","pack:release"]]);
  for(const action of ["preview","publish"]){
    const steps=planReleaseSteps(action);assert.equal(steps.length,1);
    assert.deepEqual(steps[0].args,["run","deploy:landing","--",action==="preview"?"--dry-run":"--yes","--with-downloads","--fresh-web-module","--activate-updates"]);
  }
});
