package com.yardimciasistan.android;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

/** Compare cached, redacted read projections, never transport revisions or poll timestamps.
 * Domain updated_at fields, permissions, capabilities and action receipts remain significant. */
final class AndroidSnapshotPresentation {
  private AndroidSnapshotPresentation() {}

  static boolean same(JSONObject previous, JSONObject next) {
    return previous != null && next != null && sameValue(previous, next, "");
  }

  private static boolean sameValue(Object previous, Object next, String path) {
    if (previous instanceof JSONObject && next instanceof JSONObject) {
      JSONObject left = (JSONObject) previous, right = (JSONObject) next;
      Set<String> keys = contentKeys(left, path);
      if (!keys.equals(contentKeys(right, path))) return false;
      for (String key : keys) {
        String child = path.isEmpty() ? key : path + "." + key;
        if (!sameValue(left.opt(key), right.opt(key), child)) return false;
      }
      return true;
    }
    if (previous instanceof JSONArray && next instanceof JSONArray) {
      JSONArray left = (JSONArray) previous, right = (JSONArray) next;
      if (left.length() != right.length()) return false;
      for (int index = 0; index < left.length(); index++) {
        if (!sameValue(left.opt(index), right.opt(index), path + "[]")) return false;
      }
      return true;
    }
    return previous == next || (previous != null && previous.equals(next));
  }

  private static Set<String> contentKeys(JSONObject source, String path) {
    Set<String> keys = new HashSet<>();
    Iterator<String> iterator = source.keys();
    while (iterator.hasNext()) {
      String key = iterator.next();
      if (path.isEmpty() && ("server_revision".equals(key) || "pulled_at".equals(key)
          || "ok".equals(key) || "message".equals(key) || "not_modified".equals(key))) continue;
      if ("summary".equals(path) && ("pulled_at".equals(key) || "android_snapshot_updated_at".equals(key))) continue;
      if ("generated_at".equals(key) && ("finance".equals(path)
          || (path.startsWith("reports.") && path.indexOf('.', 8) < 0))) continue;
      keys.add(key);
    }
    return keys;
  }
}
