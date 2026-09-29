<?php
declare(strict_types=1);

$configPath = __DIR__ . '/yardimci-asistan/config/business.json';
$syncKey = '';

if (is_file($configPath)) {
    $raw = @file_get_contents($configPath);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $syncKey = trim((string) ($decoded['sync_secret'] ?? ''));
        }
    }
}

$syncKeyDisplay = $syncKey !== '' ? $syncKey : '—';
?>
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Yardımcı Asistan; küçük işletmeler için masaüstü, web ve Android'i birleştiren local-first, modüler işletme yönetim sistemidir."
    />
    <meta name="theme-color" content="#07111f" />
    <meta name="ya-sync-key" content="<?php echo htmlspecialchars($syncKeyDisplay, ENT_QUOTES, 'UTF-8'); ?>" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <title>Yardımcı Asistan | Küçük İşletmeler İçin Modüler İşletme Sistemi</title>
    <script type="module" crossorigin src="/assets/index-t2kNTUv0.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-fcReLA3k.css">
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__YA_SYNC_KEY__ = <?php echo json_encode($syncKey, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;
    </script>
    <script>
      (function () {
        function liveKey() {
          try {
            return String(window.__YA_SYNC_KEY__ || "").trim();
          } catch (e) {
            return "";
          }
        }
        function displayKey() {
          var key = liveKey();
          return key !== "" ? key : "—";
        }
        function patchSyncKeyDisplay() {
          try {
            var want = displayKey();
            var codes = document.querySelectorAll("details.technical-details code");
            for (var i = 0; i < codes.length; i++) {
              var code = codes[i];
              var parent = code.parentElement;
              var label = parent ? parent.querySelector("span") : null;
              if (!label || label.textContent.trim() !== "Sync key") {
                continue;
              }
              if (code.textContent !== want) {
                code.textContent = want;
              }
            }
          } catch (e) {}
        }
        function patchDemoNavigation() {
          try {
            var existing = document.querySelectorAll('[data-ya-demo-nav="1"]');
            if (existing.length > 0) {
              return;
            }
            var links = document.querySelectorAll("a");
            for (var i = 0; i < links.length; i++) {
              var link = links[i];
              if ((link.textContent || "").trim() !== "Canlı Sistem") {
                continue;
              }
              var demoLink = document.createElement("a");
              demoLink.href = "/demo/";
              demoLink.textContent = "Web Demosu";
              demoLink.setAttribute("data-ya-demo-nav", "1");
              if (link.className) {
                demoLink.className = link.className;
              }
              link.insertAdjacentElement("afterend", demoLink);
              return;
            }
          } catch (e) {}
        }
        function patchX86Download() {
          try {
            var grid = document.querySelector(".download-grid");
            if (!grid || grid.querySelector('[data-ya-x86-download="1"]')) {
              return;
            }
            var cards = grid.querySelectorAll("a.download-card");
            var x64Card = null;
            for (var i = 0; i < cards.length; i++) {
              var small = cards[i].querySelector("small");
              if (small && /Windows.+x64/i.test(small.textContent || "")) {
                x64Card = cards[i];
                break;
              }
            }
            if (!x64Card) {
              return;
            }
            var href = x64Card.getAttribute("href") || "";
            if (!/\.exe(?:$|[?#])/i.test(href)) {
              return;
            }
            var x86Card = x64Card.cloneNode(true);
            x86Card.setAttribute("data-ya-x86-download", "1");
            x86Card.setAttribute("href", href.replace(/\.exe(?=$|[?#])/i, "-x86.exe"));
            var x86Small = x86Card.querySelector("small");
            if (x86Small) {
              x86Small.textContent = "Windows 10 / 11 · x86 (32-bit)";
            }
            x64Card.insertAdjacentElement("afterend", x86Card);
          } catch (e) {}
        }
        try {
          var realKey = liveKey();
          if (realKey !== "" && typeof window.fetch === "function") {
            var originalFetch = window.fetch.bind(window);
            window.fetch = function (url, options) {
              try {
                var target = String((url && url.url) || url || "");
                var isSyncCall = target.indexOf("/api/sync.php") !== -1;
                var isOperationsCall = target.indexOf("/api/operations.php") !== -1;
                if (isSyncCall || isOperationsCall) {
                  options = options || {};
                  var headers = options.headers;
                  if (headers) {
                    if (typeof Headers !== "undefined" && headers instanceof Headers) {
                      try {
                        headers.set("X-YA-Sync-Secret", realKey);
                      } catch (e) {}
                    } else if (Array.isArray(headers)) {
                      options.headers = headers.map(function (entry) {
                        if (
                          entry &&
                          String(entry[0]).toLowerCase() === "x-ya-sync-secret"
                        ) {
                          return [entry[0], realKey];
                        }
                        return entry;
                      });
                    } else if (typeof headers === "object") {
                      for (var name in headers) {
                        if (
                          Object.prototype.hasOwnProperty.call(headers, name) &&
                          name.toLowerCase() === "x-ya-sync-secret"
                        ) {
                          headers[name] = realKey;
                        }
                      }
                    }
                  }
                  if (isSyncCall && typeof options.body === "string" && options.body.indexOf("sync_secret") !== -1) {
                    try {
                      var body = JSON.parse(options.body);
                      if (body && typeof body.sync_secret !== "undefined") {
                        body.sync_secret = realKey;
                        options.body = JSON.stringify(body);
                      }
                    } catch (e) {}
                  }
                }
              } catch (e) {}
              return originalFetch(url, options);
            };
          }
        } catch (e) {}
        try {
          var observer = new MutationObserver(function () {
            patchSyncKeyDisplay();
            patchX86Download();
            patchDemoNavigation();
          });
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
          });
        } catch (e) {}
        var attempts = 0;
        var timer = setInterval(function () {
          patchSyncKeyDisplay();
          patchX86Download();
          patchDemoNavigation();
          attempts += 1;
          if (attempts > 40) {
            clearInterval(timer);
          }
        }, 500);
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            patchSyncKeyDisplay();
            patchX86Download();
            patchDemoNavigation();
          });
        } else {
          patchSyncKeyDisplay();
          patchX86Download();
          patchDemoNavigation();
        }
      })();
    </script>
  </body>
</html>
