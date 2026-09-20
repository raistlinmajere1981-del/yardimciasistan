import dgram, { type Socket } from "node:dgram";
import os from "node:os";

const MDNS_ADDRESS = "224.0.0.251";
const MDNS_PORT = 5353;
const DNS_CLASS_IN = 1;
const DNS_CLASS_CACHE_FLUSH_IN = 0x8001;
const DNS_TYPE_A = 1;
const DNS_TYPE_PTR = 12;
const DNS_TYPE_TXT = 16;
const DNS_TYPE_SRV = 33;
const DNS_RESPONSE_FLAGS = 0x8400;
const DEFAULT_TTL_SECONDS = 120;

export interface LocalCompanionMdnsOptions {
  desktopId: () => string;
  protocolVersion: number;
  serviceType: string;
  logInfo?: (message: string) => void;
  logWarn?: (message: string, error?: unknown) => void;
}

function normalizedServiceType(value: string): string {
  const trimmed = String(value ?? "").trim().replace(/\.$/, "");
  return trimmed.endsWith(".local") ? trimmed : `${trimmed}.local`;
}

function shortDesktopId(desktopId: string): string {
  return desktopId.replace(/^desktop-/, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "desktop";
}

function encodeName(name: string): Buffer {
  const labels = name.replace(/\.$/, "").split(".").filter(Boolean);
  const parts: Buffer[] = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, "utf8");
    if (bytes.length > 63) throw new Error("mDNS label exceeds 63 bytes.");
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function uint16(value: number): Buffer {
  const result = Buffer.allocUnsafe(2);
  result.writeUInt16BE(value & 0xffff, 0);
  return result;
}

function uint32(value: number): Buffer {
  const result = Buffer.allocUnsafe(4);
  result.writeUInt32BE(value >>> 0, 0);
  return result;
}

function record(
  name: string,
  type: number,
  dnsClass: number,
  ttl: number,
  data: Buffer
): Buffer {
  return Buffer.concat([
    encodeName(name),
    uint16(type),
    uint16(dnsClass),
    uint32(ttl),
    uint16(data.length),
    data
  ]);
}

function txtData(values: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const value of values) {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length > 255) continue;
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  return Buffer.concat(parts);
}

function srvData(port: number, hostName: string): Buffer {
  return Buffer.concat([
    uint16(0),
    uint16(0),
    uint16(port),
    encodeName(hostName)
  ]);
}

function ipv4Data(address: string): Buffer | null {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return Buffer.from(parts);
}

function externalIpv4Interfaces(): Array<{ address: string; interfaceName: string }> {
  const result: Array<{ address: string; interfaceName: string }> = [];
  for (const [interfaceName, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      result.push({ address: entry.address, interfaceName });
    }
  }
  return result;
}

function decodeName(packet: Buffer, start: number): { name: string; next: number } | null {
  const labels: string[] = [];
  let offset = start;
  let next = start;
  let jumped = false;
  const visited = new Set<number>();

  while (offset < packet.length) {
    if (visited.has(offset)) return null;
    visited.add(offset);

    const length = packet[offset];
    if (length === 0) {
      if (!jumped) next = offset + 1;
      return { name: labels.join("."), next };
    }

    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) return null;
      const pointer = ((length & 0x3f) << 8) | packet[offset + 1];
      if (!jumped) next = offset + 2;
      jumped = true;
      offset = pointer;
      continue;
    }

    if ((length & 0xc0) !== 0 || offset + 1 + length > packet.length) return null;
    labels.push(packet.subarray(offset + 1, offset + 1 + length).toString("utf8"));
    offset += 1 + length;
    if (!jumped) next = offset;
  }
  return null;
}

function queriedNames(packet: Buffer): string[] {
  if (packet.length < 12) return [];
  const count = packet.readUInt16BE(4);
  const names: string[] = [];
  let offset = 12;
  for (let index = 0; index < count; index += 1) {
    const decoded = decodeName(packet, offset);
    if (!decoded || decoded.next + 4 > packet.length) return names;
    names.push(decoded.name.toLowerCase());
    offset = decoded.next + 4;
  }
  return names;
}

export function buildLocalCompanionMdnsResponse(input: {
  desktopId: string;
  protocolVersion: number;
  serviceType: string;
  port: number;
  addresses: string[];
}): Buffer {
  const serviceName = normalizedServiceType(input.serviceType);
  const suffix = shortDesktopId(input.desktopId);
  const instanceName = `YardimciAsistan-${suffix}.${serviceName}`;
  const hostName = `yardimci-${suffix}.local`;

  const records: Buffer[] = [
    record(serviceName, DNS_TYPE_PTR, DNS_CLASS_IN, DEFAULT_TTL_SECONDS, encodeName(instanceName)),
    record(
      instanceName,
      DNS_TYPE_SRV,
      DNS_CLASS_CACHE_FLUSH_IN,
      DEFAULT_TTL_SECONDS,
      srvData(input.port, hostName)
    ),
    record(
      instanceName,
      DNS_TYPE_TXT,
      DNS_CLASS_CACHE_FLUSH_IN,
      DEFAULT_TTL_SECONDS,
      txtData([
        `protocol=${input.protocolVersion}`,
        `desktop_id=${input.desktopId}`
      ])
    )
  ];

  for (const address of input.addresses) {
    const data = ipv4Data(address);
    if (data) {
      records.push(record(
        hostName,
        DNS_TYPE_A,
        DNS_CLASS_CACHE_FLUSH_IN,
        DEFAULT_TTL_SECONDS,
        data
      ));
    }
  }

  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(DNS_RESPONSE_FLAGS, 2);
  header.writeUInt16BE(0, 4);
  header.writeUInt16BE(records.length, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  return Buffer.concat([header, ...records]);
}

export class LocalCompanionMdnsAdvertiser {
  private socket: Socket | null = null;
  private port = 0;
  private announceTimers: NodeJS.Timeout[] = [];

  constructor(private readonly options: LocalCompanionMdnsOptions) {}

  start(port: number) {
    if (this.socket) return;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error("Local companion mDNS port is invalid.");
    }

    const interfaces = externalIpv4Interfaces();
    if (interfaces.length === 0) {
      this.options.logWarn?.("Local companion mDNS skipped because no external IPv4 interface is available.");
      return;
    }

    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.socket = socket;
    this.port = port;

    socket.on("error", (error) => {
      this.options.logWarn?.("Local companion mDNS socket error.", error);
    });
    socket.on("message", (message) => {
      const serviceName = normalizedServiceType(this.options.serviceType).toLowerCase();
      const names = queriedNames(message);
      if (names.some((name) =>
        name === serviceName
        || name.endsWith(`.${serviceName}`)
        || name === "_services._dns-sd._udp.local"
      )) {
        this.announce();
      }
    });

    socket.bind(MDNS_PORT, "0.0.0.0", () => {
      try {
        socket.setMulticastTTL(255);
        socket.setMulticastLoopback(false);
      } catch {
        // Keep discovery available even if a platform ignores these hints.
      }

      for (const item of interfaces) {
        try {
          socket.addMembership(MDNS_ADDRESS, item.address);
        } catch (error) {
          this.options.logWarn?.(
            `Local companion mDNS could not join ${item.interfaceName} (${item.address}).`,
            error
          );
        }
      }

      this.options.logInfo?.(
        `Local companion mDNS advertising ${this.options.serviceType} on port ${port}.`
      );
      this.announceTimers = [0, 350, 1200].map((delay) =>
        setTimeout(() => this.announce(), delay)
      );
    });
  }

  stop() {
    for (const timer of this.announceTimers) clearTimeout(timer);
    this.announceTimers = [];
    const socket = this.socket;
    this.socket = null;
    this.port = 0;
    if (!socket) return;
    try {
      socket.close();
    } catch {
      // Shutdown is best-effort.
    }
  }

  private announce() {
    const socket = this.socket;
    if (!socket || !this.port) return;
    const interfaces = externalIpv4Interfaces();
    if (interfaces.length === 0) return;

    let packet: Buffer;
    try {
      packet = buildLocalCompanionMdnsResponse({
        desktopId: this.options.desktopId(),
        protocolVersion: this.options.protocolVersion,
        serviceType: this.options.serviceType,
        port: this.port,
        addresses: interfaces.map((item) => item.address)
      });
    } catch (error) {
      this.options.logWarn?.("Local companion mDNS packet could not be built.", error);
      return;
    }

    try {
      socket.send(packet, MDNS_PORT, MDNS_ADDRESS);
    } catch (error) {
      this.options.logWarn?.("Local companion mDNS announcement failed.", error);
    }
  }
}
