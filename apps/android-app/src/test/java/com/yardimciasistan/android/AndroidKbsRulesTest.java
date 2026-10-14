package com.yardimciasistan.android;

import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;

public final class AndroidKbsRulesTest {
  private JSONObject snapshot(String role) throws Exception {
    return new JSONObject().put("business_capabilities",new JSONArray().put("service.android").put("accommodation.rooms").put("accommodation.stays"))
        .put("androidPermissions",new JSONObject().put("kbs-device",new JSONObject().put("role",role).put("is_active",true)
            .put("permissions",new JSONArray().put("kbs.view").put("kbs.send").put("kbs.retry").put("kbs.reconcile_external"))))
        .put("kbs",new JSONObject().put("enabled",true).put("configured",true).put("provider","egm").put("pending_count",1)
            .put("password","PRIVATE_PASSWORD").put("authorized_identity_number","PRIVATE_ID")
            .put("notifications",new JSONArray().put(new JSONObject().put("id","notification-one").put("customer_name","Mock Misafir")
                .put("room_number","101").put("kind","arrival").put("status","pending").put("identity_ready",true)
                .put("identity_number","PRIVATE_ID").put("identity_snapshot",new JSONObject().put("identityNumber","PRIVATE_ID")))))
        .put("customers",new JSONArray().put(new JSONObject().put("id","customer-one").put("identity_number","PRIVATE_ID").put("document_serial_number","PRIVATE_DOCUMENT")));
  }
  private OperationData data() throws Exception { return OperationData.fromJson(snapshot("admin"),"kbs-device"); }

  @Test public void onlyActiveAdminWithIndependentPermissionsAndHousingSeesKbs() throws Exception {
    OperationData data=data(); assertTrue(KbsUiRules.canView(data));
    assertTrue(AndroidUiRules.canOpenPensionMode(data,"kbs"));
    assertEquals("kbs",AndroidUiRules.resolveDestination("pension:kbs").mode);
    for(String role:new String[]{"staff","invalid"}) {
      OperationData denied=OperationData.fromJson(snapshot(role),"kbs-device");
      assertFalse(KbsUiRules.canView(denied)); assertFalse(denied.kbs.enabled); assertTrue(denied.kbs.notifications.isEmpty());
      assertFalse(denied.hasPermission("kbs.view"));
    }
    for(String cap:new String[]{"service.android","accommodation.rooms","accommodation.stays"}) {
      JSONObject root=snapshot("admin"); JSONArray caps=root.getJSONArray("business_capabilities");
      for(int i=caps.length()-1;i>=0;i--) if(cap.equals(caps.getString(i))) caps.remove(i);
      OperationData denied=OperationData.fromJson(root,"kbs-device"); assertFalse(KbsUiRules.canView(denied)); assertFalse(denied.kbs.enabled);
    }
    for(String gate:new String[]{"inactive","no_view","disabled","unresolved"}) {
      JSONObject root=snapshot("admin"); JSONObject profile=root.getJSONObject("androidPermissions").getJSONObject("kbs-device");
      if("inactive".equals(gate)) profile.put("is_active",false);
      if("no_view".equals(gate)) profile.put("permissions",new JSONArray().put("room.view"));
      if("disabled".equals(gate)) root.getJSONObject("kbs").put("enabled",false);
      if("unresolved".equals(gate)) root.remove("androidPermissions");
      OperationData denied=OperationData.fromJson(root,"kbs-device"); assertFalse(KbsUiRules.canView(denied)); assertFalse(denied.kbs.enabled);
    }
    data.applyPermissionProfile(new JSONObject().put("role","staff").put("is_active",true).put("permissions",new JSONArray().put("kbs.view")));
    assertFalse(data.kbs.enabled); assertTrue(data.kbs.notifications.isEmpty());
  }

  @Test public void unknownAndSentNeverSendOrRetryAndRejectionNeedsProof() throws Exception {
    OperationData data=data(); OperationData.KbsNotification row=data.kbs.notifications.get(0);
    assertTrue(KbsUiRules.canSend(data,row));
    for(String status:new String[]{"submission_unknown","sent","failed"}) {
      row.status=status; assertFalse(KbsUiRules.canSend(data,row)); assertFalse(KbsUiRules.canRetry(data,row));
      assertEquals(!"sent".equals(status),KbsUiRules.canReconcile(data,row));
    }
    row.status="failed"; row.retryReady=true; assertTrue(KbsUiRules.canRetry(data,row));
    row.status="submission_unknown"; assertFalse(KbsUiRules.canRetry(data,row));
    row.status="pending"; row.deliveryRequested=true; assertFalse(KbsUiRules.canSend(data,row));
    row.deliveryRequested=false; row.identityReady=false; assertFalse(KbsUiRules.canSend(data,row));
    row.identityReady=true; data.kbs.configured=false; assertFalse(KbsUiRules.canSend(data,row));
  }

  @Test public void sendIsDurableIntentAndEachManagementActionRequiresItsOwnPermission() throws Exception {
    OperationData data=data(); OperationData.KbsNotification row=data.kbs.notifications.get(0);
    JSONObject payload=KbsUiRules.payload(data,row,KbsUiRules.SEND,false,false);
    assertEquals(3,payload.length()); assertEquals("notification-one",payload.getString("notification_id"));
    assertEquals("pending",payload.getString("expected_status"));
    assertEquals("",AndroidActionPolicy.validationError(data,KbsUiRules.SEND,payload));
    ActionOutbox.PendingAction queued=ActionOutbox.PendingAction.create("kbs_send_intent_001",KbsUiRules.SEND,payload,"target-one");
    ActionOutbox.PendingAction restored=ActionOutbox.PendingAction.fromJson(queued.toJson());
    assertEquals(queued.id,restored.id); assertEquals(payload.toString(),restored.payload.toString());
    assertFalse(restored.matchesTarget("target-two"));
    data.permissions.remove("kbs.send"); assertFalse(AndroidActionPolicy.validationError(data,KbsUiRules.SEND,payload).isEmpty());
    data.permissions.add("kbs.send"); payload.put("password","PRIVATE_PASSWORD");
    assertFalse(AndroidActionPolicy.validationError(data,KbsUiRules.SEND,payload).isEmpty()); payload.remove("password");
    row.status="submission_unknown"; assertFalse(AndroidActionPolicy.validationError(data,KbsUiRules.SEND,payload).isEmpty());
    row.status="failed"; row.retryReady=true;
    JSONObject retry=KbsUiRules.payload(data,row,KbsUiRules.RETRY,false,false); data.permissions.remove("kbs.retry");
    assertFalse(AndroidActionPolicy.validationError(data,KbsUiRules.RETRY,retry).isEmpty());
  }

  @Test public void externalReconciliationRequiresPortalVerificationAndSecondConfirmation() throws Exception {
    OperationData data=data(); OperationData.KbsNotification row=data.kbs.notifications.get(0); row.status="submission_unknown";
    for(boolean[] flags:new boolean[][]{{false,false},{true,false},{false,true}}) {
      try { KbsUiRules.payload(data,row,KbsUiRules.EXTERNAL,flags[0],flags[1]); fail("Missing confirmation accepted"); }
      catch(IllegalArgumentException expected) { assertFalse(expected.getMessage().isEmpty()); }
    }
    JSONObject payload=KbsUiRules.payload(data,row,KbsUiRules.EXTERNAL,true,true);
    assertTrue(payload.getBoolean("portal_record_verified")); assertEquals("government_portal_verified",payload.getString("external_confirmation"));
    assertEquals("",AndroidActionPolicy.validationError(data,KbsUiRules.EXTERNAL,payload));
    data.permissions.remove("kbs.reconcile_external"); assertFalse(AndroidActionPolicy.validationError(data,KbsUiRules.EXTERNAL,payload).isEmpty());
  }

  @Test public void parseAndDiskCacheDiscardIdentityAndCredentialFields() throws Exception {
    JSONObject root=snapshot("admin"); OperationData data=OperationData.fromJson(root,"kbs-device");
    assertEquals("",data.customers.get(0).identityNumber); assertEquals("",data.customers.get(0).documentSerialNumber);
    JSONObject safe=KbsUiRules.redactSnapshotForCache(root,"kbs-device"); assertFalse(safe.toString().contains("PRIVATE"));
    assertTrue(OperationData.fromJson(safe,"kbs-device").kbs.enabled);
    root.getJSONObject("kbs").getJSONArray("notifications").getJSONObject(0).put("id",new JSONObject().put("password","PRIVATE_PASSWORD"));
    assertTrue(OperationData.fromJson(root,"kbs-device").kbs.notifications.isEmpty());
    JSONObject staff=KbsUiRules.redactSnapshotForCache(snapshot("staff"),"kbs-device"); assertTrue(staff.isNull("kbs")); assertFalse(staff.toString().contains("Mock Misafir"));
    root.getJSONObject("kbs").put("enabled","true"); assertFalse(OperationData.fromJson(root,"kbs-device").kbs.enabled);
  }

  @Test public void transportReceiptNeverClaimsGovernmentSubmission() {
    for(String type:new String[]{KbsUiRules.SEND,KbsUiRules.RETRY,KbsUiRules.EXTERNAL}) {
      assertTrue(AndroidActionPolicy.isAdminOnlyAction(type));
      assertEquals("pension:kbs",NotificationEventDetector.routeForAction(type));
    }
    assertTrue(KbsUiRules.actionFeedback(KbsUiRules.SEND,"pending").startsWith("Kuyruğa alındı"));
    assertTrue(KbsUiRules.actionFeedback(KbsUiRules.SEND,"applied").startsWith("Masaüstüne ulaştı"));
    assertFalse(KbsUiRules.actionFeedback(KbsUiRules.SEND,"applied").startsWith("Resmi olarak gönderildi"));
    assertEquals("Resmi olarak gönderildi",KbsUiRules.statusLabel("sent"));
    assertEquals("Sonuç belirsiz",KbsUiRules.statusLabel("submission_unknown"));
  }

  @Test public void cachedKbsFailureNotificationsDisappearWhenRoleOrKbsAccessIsWithdrawn() throws Exception {
    OperationData data=data(); data.businessCapabilities.add("core.notifications");
    NotificationEvent event=new NotificationEvent("kbs-action",NotificationEvent.CATEGORY_ACTION,"action_failed","KBS","Fixture","pension:kbs","",1);
    java.util.Set<String> categories=new java.util.HashSet<>(); categories.add(NotificationEvent.CATEGORY_ACTION);
    assertTrue(NotificationEventDetector.isAllowed(event,data,categories));
    data.deviceRole="staff"; assertFalse(NotificationEventDetector.isAllowed(event,data,categories));
    data.deviceRole="admin"; data.permissions.remove("kbs.view"); assertFalse(NotificationEventDetector.isAllowed(event,data,categories));
    data.permissions.add("kbs.view"); data.kbs.enabled=false; assertFalse(NotificationEventDetector.isAllowed(event,data,categories));
  }
}
