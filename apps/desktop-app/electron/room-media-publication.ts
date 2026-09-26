import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import {
  getRoomMediaUploadSource,
  listPendingRoomMedia,
  markRoomMediaPublished
} from "./room-media-service";

interface RoomMediaSyncConfig {
  baseUrl: string;
  syncSecret: string;
}

export interface RoomMediaPublicationResult {
  ok: boolean;
  message: string;
  uploaded: number;
  status?: number;
}

export async function publishPendingRoomMedia(
  userDataPath: string,
  config: RoomMediaSyncConfig,
  clientId: string
): Promise<RoomMediaPublicationResult> {
  const pending = listPendingRoomMedia(userDataPath);
  let uploaded = 0;

  for (const item of pending) {
    const source = getRoomMediaUploadSource(userDataPath, item.id);
    if (!source) {
      return {
        ok: false,
        message: `${item.originalName || "Oda medyası"} yerel depoda bulunamadı.`,
        uploaded
      };
    }

    const result = await uploadRoomMediaFile(config, clientId, source.absolutePath, source.asset);
    if (!result.ok) {
      return { ...result, uploaded };
    }

    markRoomMediaPublished(userDataPath, item.id, result.url);
    uploaded += 1;
  }

  return {
    ok: true,
    message: uploaded > 0 ? `${uploaded} oda medyası web'e yüklendi.` : "Oda medyaları güncel.",
    uploaded
  };
}

async function uploadRoomMediaFile(
  config: RoomMediaSyncConfig,
  clientId: string,
  absolutePath: string,
  asset: {
    id: string;
    roomId: string;
    kind: string;
    mimeType: string;
    originalName: string;
    contentHash: string;
  }
): Promise<
  | { ok: true; message: string; url: string; status: number }
  | { ok: false; message: string; status?: number }
> {
  const endpoint = new URL(`${config.baseUrl.trim().replace(/\/$/, "")}/api/room-media.php`);
  const boundary = `----yardimci-asistan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fileName = safeFileName(asset.originalName || path.basename(absolutePath));
  const fields = [
    ["client_id", clientId],
    ["room_id", asset.roomId],
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
  const stat = fs.statSync(absolutePath);
  const contentLength = prefix.length + stat.size + suffix.length;

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
            message: String(payload.message ?? "Oda medyası yüklendi."),
            url,
            status
          });
          return;
        }
        settle({
          ok: false,
          message: String(payload.message ?? `Oda medyası yüklenemedi (HTTP ${status}).`),
          status
        });
      });
    });

    request.setTimeout(90_000, () => request.destroy(new Error("timeout")));
    request.on("error", () => {
      settle({ ok: false, message: "Oda medyası yüklenirken web modülüne ulaşılamadı." });
    });

    request.write(prefix);
    const stream = fs.createReadStream(absolutePath);
    stream.on("error", () => {
      request.destroy();
      settle({ ok: false, message: "Oda medya dosyası okunamadı." });
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

function safeFileName(value: string): string {
  const base = path.basename(value).replace(/[^A-Za-z0-9._-]+/g, "-");
  return base.slice(-180) || "room-media";
}
