import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

export interface PublicResourceMediaSyncConfig {
  baseUrl: string;
  syncSecret: string;
}

export interface PublicResourceMediaPublicationResult {
  ok: boolean;
  message: string;
  uploaded: number;
  status?: number;
}

export interface PublicResourceMediaUploadAsset {
  id: string;
  resourceId: string;
  kind: string;
  mimeType: string;
  originalName: string;
  contentHash: string;
}

export async function uploadPublicResourceMediaFile(
  config: PublicResourceMediaSyncConfig,
  clientId: string,
  endpointPath: string,
  resourceField: string,
  absolutePath: string,
  asset: PublicResourceMediaUploadAsset,
  messages: {
    success: string;
    httpFailure: (status: number) => string;
    connectionFailure: string;
    readFailure: string;
    fallbackFileName: string;
  },
  verifiedBytes?: Buffer
): Promise<
  | { ok: true; message: string; url: string; status: number }
  | { ok: false; message: string; status?: number }
> {
  const endpoint = new URL(`${config.baseUrl.trim().replace(/\/$/, "")}${endpointPath}`);
  const boundary = `----yardimci-asistan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fileName = safeFileName(asset.originalName || path.basename(absolutePath), messages.fallbackFileName);
  const fields = [
    ["client_id", clientId],
    [resourceField, asset.resourceId],
    ["media_id", asset.id],
    ["kind", asset.kind],
    ["content_hash", asset.contentHash]
  ];

  const prefixParts = fields.map(([name, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
  );
  prefixParts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${asset.mimeType}\r\n\r\n`
  );

  const prefix = Buffer.from(prefixParts.join(""), "utf8");
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  // Product photos pass the exact bounded bytes whose MIME and SHA were checked.
  // Do not reopen their path after asynchronous preparation.
  const size = verifiedBytes ? verifiedBytes.length : fs.statSync(absolutePath).size;
  const contentLength = prefix.length + size + suffix.length;

  return new Promise((resolve) => {
    const transport = endpoint.protocol === "http:" ? http : https;
    let settled = false;
    const settle = (
      value:
        | { ok: true; message: string; url: string; status: number }
        | { ok: false; message: string; status?: number }
    ) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const request = transport.request(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-YA-Sync-Secret": config.syncSecret,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(contentLength)
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (total < 1024 * 1024) {
          chunks.push(buffer);
          total += buffer.length;
        }
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        } catch {
          payload = {};
        }
        const url = String(payload.url ?? "").trim();
        if (status >= 200 && status < 300 && payload.ok === true && url) {
          settle({
            ok: true,
            message: String(payload.message ?? messages.success),
            url,
            status
          });
          return;
        }
        settle({
          ok: false,
          message: String(payload.message ?? messages.httpFailure(status)),
          status
        });
      });
    });

    request.setTimeout(90_000, () => request.destroy(new Error("timeout")));
    request.on("error", () => {
      settle({ ok: false, message: messages.connectionFailure });
    });

    request.write(prefix);
    if (verifiedBytes) {
      request.write(verifiedBytes);
      request.end(suffix);
      return;
    }
    const stream = fs.createReadStream(absolutePath);
    stream.on("error", () => {
      request.destroy();
      settle({ ok: false, message: messages.readFailure });
    });
    stream.on("data", (chunk) => {
      if (!request.write(chunk)) {
        stream.pause();
        request.once("drain", () => stream.resume());
      }
    });
    stream.on("end", () => {
      request.end(suffix);
    });
  });
}

function safeFileName(value: string, fallback: string): string {
  const base = path.basename(value).replace(/[^A-Za-z0-9._-]+/g, "-");
  return base.slice(-180) || fallback;
}
