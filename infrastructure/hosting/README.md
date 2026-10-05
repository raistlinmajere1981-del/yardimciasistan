# Instagram staging logging boundary

These are operator configuration snippets, not web-public assets. They are not deployed
automatically by the web package. No routing, authentication or provider behavior changes.

## Apache 2.4

Include `instagram-staging.apache.conf` inside the site's existing VirtualHost. Required
modules: env, setenvif, log_config. Replace **every** existing CustomLog/GlobalLog that
receives this site (including global logs) with a filtered pipe and add
`env=!ya_instagram_stage`. The snippet alone does not filter an existing log. Preserve
its actual absolute destination and existing format, for example:

```apache
CustomLog "|/usr/bin/php /private/hosting/instagram-staging-log-filter.php /existing/access.log" combined env=!ya_instagram_stage
```

Accepted staging requests are excluded; the pipe redacts any encoded/pre-parse target or
staging referer that bypasses the condition. The optional route-only format preserves timestamp/method/status/bytes/duration without
request URI/path/query, headers or body. LocationMatch marks decoded endpoint paths;
routine error/debug logging for that route is suppressed. PHP independently disables
error logging and error display before loading staging code. `LogLevel` alone is not a
privacy guarantee: Apache file logs can still contain notices and pre-parse errors.
Install `instagram-staging-log-filter.php` outside DocumentRoot and replace the **existing**
ErrorLog with the piped form in the snippet, using actual absolute PHP/filter/log paths.
The CLI filter strips staging URL/path/query values before append, including escaped and
encoded forms; unrelated error text is retained. It never stores raw input. Preserve log
ownership/permissions and the existing rotation/reload procedure (the pipe reopens on restart).
Do not add a second unfiltered ErrorLog. Do not enable mod_dumpio
or request-body/header tracing. Server-startup/emergency failures, security audit logs
and reverse-proxy logs remain operator-owned: omit/redact the endpoint there too.

## nginx / FastCGI / proxy

Include `instagram-staging.nginx.conf` inside the **existing** endpoint location that
also handles `/api/instagram-media.php/<capability>.jpg`. Preserve current FastCGI
PATH_INFO, authentication and routing. For a shared PHP regex handler, create the exact
endpoint handler only by copying its existing routing configuration; do not include a
bare location that would change how PHP executes. The snippet disables location access
and error logs; verify no downstream/upstream handler overrides them.

Apply the exclusion to each proxy/CDN/WAF log too, including refused requests with
queries. Do not log `$request`, `$request_uri`, `$uri`, `$args`, request bodies, cookies,
Authorization or X-YA-Sync-Secret on this route. Disable debug tracing and APM payload
capture, including outbound api.iletimerkezi.com and graph.instagram.com requests.
Pre-location/server-level nginx errors are not covered by a location override; their
existing collection pipeline also needs staging URL redaction or an equivalent exclusion.

## Verification before activation

Run the host's `apachectl configtest` or `nginx -t` before its normal reload. Probe upload,
valid binary GET, unknown/expired capability, rejected query/path and unauthorized POST
with **synthetic** canaries. Confirm HTTP results remain unchanged, the synthetic canaries
appear in no access/error/PHP/proxy/audit/APM log, and an unrelated route still logs normally.
Never use production tokens or credentials as probes. Managed hosting that does not expose
per-route logs needs the host administrator's equivalent exclusion; PHP/.htaccess cannot
control the front proxy's access logs. Existing logs are not rewritten/deleted by this change.

References: [Apache conditional access logging](https://httpd.apache.org/docs/2.4/mod/mod_log_config.html),
[Apache LogLevel](https://httpd.apache.org/docs/2.4/mod/core.html#loglevel),
[nginx access_log](https://nginx.org/en/docs/http/ngx_http_log_module.html#access_log),
[nginx error_log](https://nginx.org/en/docs/ngx_core_module.html#error_log).
