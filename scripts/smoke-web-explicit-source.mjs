import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const {connectPublicationSource} = require(resolve("apps/desktop-app/dist-electron/publication-source-service.js"));
const clientId="desktop-test-local-owner";
const baseUrl="https://fixture.invalid/yardimci-asistan";
const syncSecret="fixture-test-secret-123";
async function scenario(label, remoteEpoch, remoteId, expectedActs) {
  const actions=[],recorded=[];
  const db={
    getSyncRuntimeStatus:()=>({clientId}),
    replacePublicationSourceEpoch:(target,epoch)=>recorded.push(["epoch",target,epoch]),
    ensurePublicationTarget:target=>recorded.push(["target",target])
  };
  const result=await connectPublicationSource(db,{baseUrl,syncSecret,fetchImpl:async(_url,opts)=>{
    const request=JSON.parse(opts.body);
    actions.push(request);
    if(request.action==="restore_sync_state")return Response.json({
      ok:true,message:"state",source_epoch:remoteEpoch,source_client_id:remoteId,
      requests_through:0,orders_through:0
    });
    if(request.action==="activate_publication_source") return Response.json({
      ok:true,message:"activated",source_client_id:clientId,source_epoch:request.expected_epoch+1,
      activation_key:request.activation_key
    });
    throw Error("Unexpected action "+request.action);
  }});
  assert.equal(result.ok,true,label+": "+result.message);
  assert.equal(actions.filter(a=>a.action==="activate_publication_source").length,expectedActs,label);
  if(expectedActs) assert.equal(actions[1].expected_epoch,remoteEpoch,label);
  assert.deepEqual(recorded,[["epoch",baseUrl,expectedActs?remoteEpoch+1:remoteEpoch],["target",baseUrl]]);
  console.log(label+"-ok");
}
await scenario("new-source",0,"",1);
await scenario("other-desktop-takeover",1,"desktop-other-owner",1);
await scenario("own-source-adoption",2,clientId,0);
await scenario("remote-clean-reset",0,"",1);
console.log("web-connection-explicit-source-smoke-ok");
