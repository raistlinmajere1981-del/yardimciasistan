#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
root=$(mktemp -d /tmp/ya-gallery-upload-XXXXXX)
server_pid=""
cleanup() { if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi; rm -rf "$root"; }
trap cleanup EXIT
mkdir -p "$root/yardimci-asistan/api" "$root/yardimci-asistan/config"
cp firm-template/web-module/api/business-gallery-media.php "$root/yardimci-asistan/api/"
printf '%s\n' '{"sync_secret":"test-gallery-only"}' > "$root/yardimci-asistan/config/business.json"
python3 - "$root/photo.png" <<'PY'
import base64,sys
open(sys.argv[1],"wb").write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg=="))
PY
hash=$(sha256sum "$root/photo.png" | cut -d ' ' -f1)
port=$(python3 - <<'PY'
import socket
s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()
PY
)
php -S "127.0.0.1:$port" -t "$root" > "$root/php.log" 2>&1 &
server_pid=$!
url="http://127.0.0.1:$port/yardimci-asistan/api/business-gallery-media.php"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then break; fi
  sleep .15
done
curl -fsS -H 'X-YA-Sync-Secret: test-gallery-only' \
  -F gallery_id=gallery -F media_id=gallery_test_photo -F client_id=gallery_smoke \
  -F kind=photo -F content_hash="$hash" -F "file=@$root/photo.png;type=image/png" "$url" > "$root/result.json"
python3 - "$root" <<'PY'
import json,sys,pathlib
root=pathlib.Path(sys.argv[1])
reply=json.loads((root/"result.json").read_text())
assert reply["ok"] is True,reply
assert reply["url"].startswith("/yardimci-asistan/media/gallery/gallery/"),reply
assert (root/reply["url"].lstrip("/")).exists(),reply
print("gallery-upload-authorized-smoke-ok")
PY
unauthorized=$(curl -sS -o /dev/null -w '%{http_code}' -H 'X-YA-Sync-Secret: wrong-secret' \
  -F gallery_id=gallery -F media_id=another -F client_id=smoke -F kind=photo -F "file=@$root/photo.png" "$url")
[[ "$unauthorized" == 401 ]]
blocked=$(curl -sS -o /dev/null -w '%{http_code}' -H 'X-YA-Sync-Secret: test-gallery-only' \
  -F gallery_id=gallery -F media_id=another -F client_id=smoke -F kind=video -F "file=@$root/photo.png" "$url")
[[ "$blocked" == 422 ]]
echo gallery-upload-auth-and-type-smoke-ok
