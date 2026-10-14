import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Exercise production PHP/SQLite functions without a listener or any institution I/O.
const php = readFileSync("firm-template/web-module/api/sync.php", "utf8");
const body = name => {
  const start=php.indexOf(`function ${name}(`); assert.ok(start>=0,name);
  const end=php.indexOf("\nfunction ",start+1); assert.ok(end>start,name); return php.slice(start,end);
};
const functions=["ya_sync_enqueue_android_action","ya_sync_android_action_types","ya_sync_android_permissions","ya_sync_sanitize_android_permissions",
  "ya_sync_android_management_action_permission","ya_sync_android_action_permission","ya_sync_android_action_capability_allowed",
  "ya_sync_android_capabilities_include",
  "ya_sync_android_folio_charge_permissions_allowed","ya_sync_android_market_financial_permissions_allowed","ya_sync_android_financial_intent_matches",
  "ya_sync_public_android_action","ya_sync_get_android_actions","ya_sync_get_visible_android_actions","ya_sync_sanitize_android_customers",
  "ya_sync_string","ya_sync_string_array","ya_sync_bool","ya_sync_int"];
const root=mkdtempSync(join(tmpdir(),"android-kbs-hosting-")); mkdirSync(join(root,"lib"));
for(const file of ["storage.php","android-device-auth.php","android-kbs-projection.php"]) copyFileSync(`firm-template/web-module/lib/${file}`,join(root,"lib",file));
try {
  for(const personal of [true,false]) {
    rmSync(join(root,"data"),{recursive:true,force:true});
    const program=`
require ${JSON.stringify(join(root,"lib","android-device-auth.php"))};
require ${JSON.stringify(join(root,"lib","android-kbs-projection.php"))};
define('YA_ANDROID_DEVICE_AUTHENTICATED',${personal?"true":"false"});
${functions.map(body).join("\n")}
class FixtureResponse extends Exception { public function __construct(public int $status,public array $body) { parent::__construct('fixture'); } }
function ya_sync_response(int $status,array $body): void { throw new FixtureResponse($status,$body); }
function ya_sync_load_android_snapshot(): array { return $GLOBALS['snapshot']; }
function ya_sync_update_state(array $changes): void {}
function check(bool $condition,string $name): void { if(!$condition) throw new RuntimeException($name); }
function enqueue(string $id,string $type,array $payload): FixtureResponse {
    try { ya_sync_enqueue_android_action(['action_id'=>$id,'action_type'=>$type,'device_id'=>'kbs-fixture-device','payload'=>$payload]); }
    catch(FixtureResponse $response) { return $response; } throw new RuntimeException('no_response');
}
$caps=['service.android','accommodation.rooms','accommodation.stays'];
$permissions=['kbs.view','kbs.send','kbs.retry','kbs.reconcile_external','room.update_status'];
$profile=['role'=>'admin','is_active'=>true,'permissions'=>$permissions];
$raw=['enabled'=>true,'configured'=>true,'provider'=>'egm','pending_count'=>1,'password'=>'PRIVATE_PASSWORD','username'=>'PRIVATE_USER','facility_code'=>'PRIVATE_FACILITY',
    'notifications'=>[['id'=>'notification-one','customer_name'=>'Mock Misafir','room_name'=>'Oda','room_number'=>'101','kind'=>'arrival','status'=>'pending','identity_ready'=>true,
      'identity_number'=>'PRIVATE_ID','identity_snapshot'=>['identityNumber'=>'PRIVATE_ID'],'provider_reference'=>'PRIVATE_RECEIPT','retry_ready'=>true]]];
$safe=ya_kbs_snapshot($raw,$caps); check($safe!==null,'enabled_projection');
check(!str_contains(json_encode($safe),'PRIVATE'),'allowlist_no_secrets'); check(!$safe['notifications'][0]['retry_ready'],'pending_cannot_retry');
foreach($caps as $cap) check(ya_kbs_snapshot($raw,array_values(array_diff($caps,[$cap])))===null,'capability_redaction');
check(ya_kbs_snapshot([...$raw,'enabled'=>false],$caps)===null,'disabled_redaction');
check(ya_kbs_for_device($raw,$caps,$profile,true)!==null,'admin_projection');
foreach([[...$profile,'role'=>'staff'],[...$profile,'is_active'=>false],[...$profile,'permissions'=>[]]] as $denied) check(ya_kbs_for_device($raw,$caps,$denied,true)===null,'role_permission_redaction');
check(ya_kbs_for_device($raw,$caps,$profile,false)===null,'shared_secret_projection_denied');
$staff=ya_sync_sanitize_android_permissions(['kbs-fixture-device'=>[...$profile,'role'=>'staff']]);
check(count(array_intersect($permissions,$staff['kbs-fixture-device']['permissions']))===1,'no_kbs_staff_permission');
check(!str_contains(json_encode(ya_sync_sanitize_android_customers([['id'=>'customer-one','identity_number'=>'PRIVATE_ID','document_serial_number'=>'PRIVATE_DOCUMENT']])),'PRIVATE'),'customer_identity_redaction');
$GLOBALS['snapshot']=['business_capabilities'=>$caps,'kbs'=>$safe,'androidPermissions'=>['kbs-fixture-device'=>$profile]];
$payload=['notification_id'=>'notification-one','provider'=>'egm','expected_status'=>'pending'];
foreach(['kbs_send_request'=>'kbs.send','kbs_retry_prepare'=>'kbs.retry','kbs_mark_sent_externally'=>'kbs.reconcile_external'] as $type=>$permission) {
    check(in_array($type,ya_sync_android_action_types(),true),'typed_action_allowlist');
    check(ya_sync_android_action_permission($type,[])===$permission,'typed_action_permission');
    check(ya_sync_android_action_capability_allowed($type,$payload,$snapshot),'typed_action_capability');
}
$first=enqueue('kbs_host_send_fixture_001','kbs_send_request',$payload);
if(!YA_ANDROID_DEVICE_AUTHENTICATED) {
    check($first->status===403,'shared_secret_send_denied');
    check(ya_storage_open()->query('SELECT COUNT(*) FROM android_actions')->fetchColumn()==0,'no_unauthorized_queue');
} else {
    check($first->status===201 && $first->body['action']['status']==='pending','queued_never_sent');
    check(enqueue('kbs_host_send_fixture_001','kbs_send_request',$payload)->body['deduplicated']===true,'same_intent_replay');
    check(enqueue('kbs_host_send_fixture_001','kbs_send_request',[...$payload,'provider'=>'jandarma'])->status===409,'changed_intent_denied');
    check(enqueue('kbs_host_send_fixture_001','room_status_update',['room_id'=>'room-one','status'=>'cleaning'])->status===403,'old_type_collision');
    check(enqueue('kbs_host_secret_fixture','kbs_send_request',[...$payload,'password'=>'PRIVATE_PASSWORD'])->status===422,'credential_payload_rejected');
    check(enqueue('kbs_host_external_first','kbs_mark_sent_externally',$payload)->status===422,'second_confirmation_required');
    check(enqueue('kbs_host_external_both','kbs_mark_sent_externally',[...$payload,'portal_record_verified'=>true,'external_confirmation'=>'government_portal_verified'])->status===201,'explicit_external_intent');
    check(enqueue('kbs_host_retry_fixture','kbs_retry_prepare',[...$payload,'expected_status'=>'failed'])->status===201,'typed_retry_intent');
    check(count(ya_sync_get_visible_android_actions('kbs-fixture-device',50,$snapshot,$profile))===3,'authorized_history');
    foreach([[...$profile,'role'=>'staff'],[...$profile,'is_active'=>false],[...$profile,'permissions'=>['room.update_status']]] as $denied) {
        $snapshot['androidPermissions']['kbs-fixture-device']=$denied;
        check(enqueue('kbs_host_denied_fixture','kbs_send_request',$payload)->status===403,'role_permission_gate');
        check(ya_sync_get_visible_android_actions('kbs-fixture-device',50,$snapshot,$denied)===[],'no_history_leak');
    }
    $snapshot['androidPermissions']['kbs-fixture-device']=$profile;
    foreach($caps as $cap) {
        $snapshot['business_capabilities']=array_values(array_diff($caps,[$cap]));
        check(enqueue('kbs_host_caps_fixture','kbs_send_request',$payload)->status===403,'capability_action_gate');
    }
    $snapshot['business_capabilities']=$caps; $snapshot['kbs']=null;
    check(enqueue('kbs_host_disabled_fixture','kbs_send_request',$payload)->status===403,'disabled_action_gate');
    check(ya_storage_open()->query('SELECT COUNT(*) FROM android_actions')->fetchColumn()==3,'only_authorized_queue');
}
echo 'kbs-hosting-fixture-ok';
`;
    const result=spawnSync("php",["-r",program],{encoding:"utf8",timeout:15000});
    assert.equal(result.status,0,result.stderr); assert.equal(result.stdout,"kbs-hosting-fixture-ok");
  }
  console.log("android-kbs-hosting-smoke-ok: PHP/SQLite typed queue, admin/personal-device policy, duplicate protection and allowlist redaction");
} finally { rmSync(root,{recursive:true,force:true}); }
