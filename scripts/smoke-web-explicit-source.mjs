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
    getRestoreReconciliationStatus: () => undefined,
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

const {ensurePublicationSource} = require(resolve("apps/desktop-app/dist-electron/publication-source-service.js"));
{
  // A Windows demo restore rotates the client ID but retains an activation_pending
  // reconciliation. The Settings "Bağlan" action must not claim a different
  // activation key before the restore coordinator runs: Hosting forbids reuse.
  let remoteEpoch = 5;
  let remoteClientId = "desktop-before-restore";
  const clientId = "desktop-restored-windows";
  const activationKeys = [];
  const restore = { operationId: "restore-windows-demo", state: "activation_pending", target: "",
    expectedEpoch: null, sourceEpoch: 0 };
  let localEpoch = 0;
  const db = {
    getSyncRuntimeStatus: () => ({ clientId }),
    getRestoreReconciliationStatus: () => restore,
    getPublicationSourceEpoch: () => localEpoch,
    savePublicationSourceEpoch: (_, epoch) => { localEpoch = epoch; },
    replacePublicationSourceEpoch: (_, epoch) => { localEpoch = epoch; },
    ensurePublicationTarget: () => {},
    saveRestoreActivationExpectation: (_, target, epoch) => {
      restore.target = target; restore.expectedEpoch = epoch;
    },
    finishRestoreActivation: (_, target, epoch) => {
      assert.equal(target, baseUrl);
      assert.equal(epoch, restore.expectedEpoch + 1);
      restore.state = "reconciliation_pending"; restore.sourceEpoch = epoch;
      localEpoch = epoch;
    }
  };
  const config = { baseUrl, syncSecret, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "restore_sync_state") return Response.json({
      ok: true, message: "state", source_epoch: remoteEpoch, source_client_id: remoteClientId,
      requests_through: 0, orders_through: 0
    });
    if (body.action === "activate_publication_source") {
      if (body.expected_epoch !== remoteEpoch || remoteClientId === clientId) {
        return Response.json({ ok: false, error: "source_retired", message: "source_retired" }, { status: 409 });
      }
      remoteEpoch++;
      remoteClientId = body.client_id;
      activationKeys.push(body.activation_key);
      return Response.json({ ok: true, message: "activated",
        source_client_id: clientId, source_epoch: remoteEpoch, activation_key: body.activation_key });
    }
    throw new Error("Unexpected request: " + body.action);
  }};
  const connected = await connectPublicationSource(db, config);
  assert.equal(connected.ok, true, connected.message);
  const firstCycle = await ensurePublicationSource(db, config);
  assert.equal(firstCycle.ok, true, "restore must still publish after Settings Connect: " + firstCycle.message);
  assert.equal(restore.state, "reconciliation_pending", "restore activation was committed");
  assert.deepEqual(activationKeys, ["restore-windows-demo:activate"], "one restore CAS activation, never a second source claim");
  assert.equal(firstCycle.sourceEpoch, 6);
  console.log("restore-connect-first-sync-ok");
}
