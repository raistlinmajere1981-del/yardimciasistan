package com.yardimciasistan.dealer;

import android.os.Bundle;
import android.util.Base64;
import org.json.JSONObject;
import javax.net.ssl.*;
import java.io.*;
import java.net.*;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.util.UUID;

/** Actual device HTTPS client -> local TLS proxy -> unchanged PHP APIs. Fixture CA never enters customer APKs or OS trust. */
final class DealerAccountDeviceChecks {
  static void run(Bundle arguments) throws Exception {
    String base=arguments.getString("account_base", ""), certificate=arguments.getString("account_ca", "");
    if (!base.matches("https://localhost:[0-9]+/yardimci-asistan/") || certificate.isEmpty()) throw new AssertionError("Actual local account fixture is required");
    KeyStore trust=KeyStore.getInstance(KeyStore.getDefaultType());trust.load(null);
    trust.setCertificateEntry("local-fixture",CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(Base64.decode(certificate,Base64.DEFAULT))));
    TrustManagerFactory manager=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());manager.init(trust);
    SSLContext context=SSLContext.getInstance("TLS");context.init(null,manager.getTrustManagers(),null);
    DealerApi.Connections connections=url->{HttpsURLConnection connection=(HttpsURLConnection)url.openConnection();connection.setSSLSocketFactory(context.getSocketFactory());return connection;};
    DealerApi api=new DealerApi(base,connections);
    JSONObject credentials=new JSONObject().put("email","physical@example.test").put("password","Account-fixture-Password-249!");
    check(api.call("account/config",null,"").body.getBoolean("enabled"),"Online Sales should start enabled");
    String first=api.call("account/login",credentials,"").cookie;
    String account=api.call("account/session",null,first).body.getJSONObject("account").getString("id");
    denied(api,"catalog",null,first,403,"dealer_access_required");
    String rotated=api.call("account/refresh",new JSONObject(),first).cookie;
    denied(api,"account/session",null,first,401,"");
    check(api.call("account/session",null,rotated).body.getJSONObject("account").getString("id").equals(account),"Refresh changed identity");
    api.call("account/logout",new JSONObject(),rotated);denied(api,"account/session",null,rotated,401,"");
    control(base,"promote",connections);
    String cookie=api.call("account/login",credentials,"").cookie;
    JSONObject catalog=api.call("catalog",null,cookie).body.getJSONObject("catalog");
    JSONObject product=catalog.getJSONArray("products").getJSONObject(0);check(product.getDouble("price")==80,"Dealer price must come from Desktop");
    JSONObject order=new JSONObject().put("idempotencyKey",UUID.randomUUID().toString()).put("items",new org.json.JSONArray().put(new JSONObject().put("productId",product.getString("product_id")).put("quantity",1))).put("delivery",new JSONObject().put("method","pickup").put("address",JSONObject.NULL));
    String receipt=api.submit(order,cookie).getString("order_id");check(api.submit(order,cookie).getString("order_id").equals(receipt),"Retry duplicated order");
    control(base,"import",connections);check(api.call("orders",null,cookie).body.getJSONArray("orders").getJSONObject(0).getString("order_id").equals(receipt),"Canonical order belongs to another customer");
    control(base,"demote",connections);denied(api,"catalog",null,cookie,403,"dealer_access_required");
    check(api.call("account/session",null,cookie).body.getJSONObject("account").getString("id").equals(account),"Dealer demotion destroyed normal account");
    control(base,"disable",connections);denied(api,"account/session",null,cookie,403,"online_sales_disabled");denied(api,"account/login",credentials,"",403,"online_sales_disabled");
    api.call("account/logout",new JSONObject(),cookie);
    control(base,"enable",connections);cookie=api.call("account/login",credentials,"").cookie;
    check(api.call("account/session",null,cookie).body.getJSONObject("account").getString("id").equals(account),"Reactivation changed account identity");
    control(base,"revoke",connections);denied(api,"account/session",null,cookie,401,"");
  }
  private static void control(String base,String action,DealerApi.Connections connections) throws Exception {
    HttpURLConnection connection=connections.open(new URI(base).resolve("/__fixture/"+action).toURL());
    connection.setConnectTimeout(15000);connection.setReadTimeout(30000);
    try {if(connection.getResponseCode()!=200)throw new AssertionError("Local Desktop control failed: "+action);}finally{connection.disconnect();}
  }
  private static void denied(DealerApi api,String endpoint,JSONObject body,String cookie,int status,String code) throws Exception {
    try {api.call(endpoint,body,cookie);throw new AssertionError("Private endpoint allowed: "+endpoint);}
    catch(DealerApi.Failure error){check(error.status==status,"Unexpected denial: "+endpoint+" "+error.status);if(!code.isEmpty())check(code.equals(error.code),"Unexpected denial reason");}
  }
  private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
}
