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
    JSONObject draft=new JSONObject().put("items",new org.json.JSONArray().put(new JSONObject().put("productId",product.getString("product_id")).put("quantity",1)))
        .put("delivery",new JSONObject().put("method","pickup").put("address",JSONObject.NULL));
    JSONObject firstQuote=DealerCheckout.verifiedQuote(api.call("checkout-quote",draft,cookie).body,draft);
    check(firstQuote.getLong("subtotal_minor")==8000 && firstQuote.getLong("total_minor")==8000,"Server dealer A quote must be 80, not retail 100");
    check(!firstQuote.toString().contains("dealer_price_b"),"Private dealer B prices leaked into the quote");
    JSONObject order=DealerCheckout.approvedRequest(draft,firstQuote,true,true,false);
    check("bank_transfer".equals(order.getString("paymentMethod")),"Bank transfer missing");
    check(order.getJSONObject("consent").getBoolean("agreement"),"Consent not recorded");
    JSONObject rejectedConsent=new JSONObject(order.toString());
    rejectedConsent.remove("consent");
    try {api.call("order",rejectedConsent,cookie);throw new AssertionError("Missing legal consent accepted");}
    catch(DealerApi.Failure error){check(error.status==422,"Consent missing must be rejected without creating an order");}
    String receipt=api.submit(order,cookie).getString("order_id");check(api.submit(order,cookie).getString("order_id").equals(receipt),"Retry duplicated order");
    JSONObject reported=api.call("order-payment",new JSONObject().put("action","report").put("orderId",receipt),cookie).body.getJSONObject("order");
    check(reported.getString("payment_status").equals("verification_pending"),"Dealer payment report must await business verification");
    JSONObject repeated=api.call("order-payment",new JSONObject().put("action","report").put("orderId",receipt),cookie).body.getJSONObject("order");
    check(repeated.getString("payment_status").equals("verification_pending"),"Payment report is not idempotent");
    check(api.call("order-payment",new JSONObject().put("action","read").put("orderId",receipt),cookie).body.getJSONObject("order")
        .getString("payment_status").equals("verification_pending"),"Payment status read failed");
    control(base,"import",connections);check(api.call("orders",null,cookie).body.getJSONArray("orders").getJSONObject(0).getString("order_id").equals(receipt),"Canonical order belongs to another customer");
    JSONObject before=api.call("catalog",null,cookie).body.getJSONObject("catalog");
    String oldRevision=before.getString("catalog_revision"),accessId=before.getString("access_id");
    check(oldRevision.matches("[a-f0-9]{64}"),"Catalog revision must be a SHA-256 hex digest");
    check(before.getJSONArray("products").length()==1,"Catalog must expose only this dealer's product");
    check(before.getJSONArray("products").getJSONObject(0).getDouble("price")==80,"Catalog price changed before the fixture reprice");
    control(base,"reprice",connections);
    JSONObject repriced=api.call("catalog",null,cookie).body.getJSONObject("catalog");
    String newRevision=repriced.getString("catalog_revision");
    check(newRevision.matches("[a-f0-9]{64}")&&!newRevision.equals(oldRevision),"Repricing must publish a new catalog revision");
    check(repriced.getString("access_id").equals(accessId),"Repricing changed the dealer access identity");
    check(repriced.getJSONArray("products").length()==1,"Repricing exposed another product or dealer");
    check(!repriced.has("dealers")&&!repriced.has("order_history"),"Catalog response must not embed other dealer data");
    JSONObject repricedProduct=repriced.getJSONArray("products").getJSONObject(0);
    check(repricedProduct.getString("product_id").equals(product.getString("product_id")),"Repricing replaced the canonical product id");
    check(repricedProduct.getDouble("price")==65,"Repriced catalog must expose the new dealer A price");
    check(repricedProduct.getString("currency").equals("TRY"),"Repricing changed the dealer currency");
    privateFields(repricedProduct);
    JSONObject replayed=api.submit(order,cookie);
    check(replayed.getString("order_id").equals(receipt),"Catalog change replaced the accepted order");
    check(replayed.getDouble("quoted_total")==80,"Retried acceptance must keep its original quote");
    check(api.call("orders",null,cookie).body.getJSONArray("orders").length()==1,"Retried submission created another order");
    JSONObject nextDraft=new JSONObject(draft.toString()).put("catalogRevision",oldRevision);
    JSONObject repricedQuote=DealerCheckout.verifiedQuote(api.call("checkout-quote",nextDraft,cookie).body,nextDraft);
    check(repricedQuote.getLong("subtotal_minor")==6500,"New authorized price must be 65");
    check(!firstQuote.getString("quote_id").equals(repricedQuote.getString("quote_id")),"Repricing must invalidate the old quote");
    JSONObject repricedOrder=DealerCheckout.approvedRequest(nextDraft,repricedQuote,true,true,false);
    JSONObject quote=api.submit(repricedOrder,cookie);
    check(!quote.getString("order_id").equals(receipt),"New attempt reused the previous order identity");
    check(quote.getDouble("quoted_total")==65,"New order must be quoted from the repriced catalog");
    check(quote.getString("currency").equals("TRY"),"New order currency changed");
    check(api.call("orders",null,cookie).body.getJSONArray("orders").length()==2,"New order must be recorded exactly once");
    String relogin=api.call("account/login",credentials,"").cookie;
    check(api.call("account/session",null,relogin).body.getJSONObject("account").getString("id").equals(account),"Re-login changed the ordinary account identity");
    JSONObject afterLogin=api.call("catalog",null,relogin).body.getJSONObject("catalog");
    check(afterLogin.getString("catalog_revision").equals(newRevision),"Re-login must see the published catalog revision");
    check(afterLogin.getJSONArray("products").getJSONObject(0).getDouble("price")==65,"Re-login must see the repriced dealer catalog");
    control(base,"demote",connections);denied(api,"catalog",null,cookie,403,"dealer_access_required");
    denied(api,"catalog",null,relogin,403,"dealer_access_required");
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
  private static void privateFields(JSONObject product) {
    for (String field : new String[]{"dealer_price_a","dealer_price_b","dealerPriceA","dealerPriceB","purchase_price","purchasePrice","sale_price","salePrice","cost_price","costPrice","customer_id","customerId","dealerAccessId","access_revision"})
      check(!product.has(field),"Private catalog field leaked: "+field);
    check(product.has("product_id")&&product.has("price")&&product.has("currency")&&product.has("name"),"Catalog product lost its public fields");
  }
  private static void check(boolean value,String message){if(!value)throw new AssertionError(message);}
}
