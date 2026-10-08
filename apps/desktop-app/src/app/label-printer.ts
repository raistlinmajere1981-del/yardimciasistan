export type LabelPrinterId = "preview" | "png" | "pdf" | "zpl" | "tspl" | "system";
type LabelPrinterAvailability = "available" | "planned";
type LabelPrinterOutput = "preview" | "file" | "device";

export interface LabelSizePreset {
  id: "58x40" | "50x30" | "40x30";
  label: string;
  widthMm: number;
  heightMm: number;
}

interface LabelProductSnapshot {
  name: string;
  sku: string;
  barcode: string;
  salePrice: number;
  currency: string;
}

export interface LabelPrintJob {
  product: LabelProductSnapshot;
  size: LabelSizePreset;
  copies: number;
  showPrice: boolean;
  showSku: boolean;
  showBarcode: boolean;
}

export interface LabelPrintResult {
  printerId: LabelPrinterId;
  fileName: string;
  mimeType: string;
  blob?: Blob;
  previewDataUrl?: string;
  message: string;
}

export interface LabelPrinterAdapter {
  id: LabelPrinterId;
  label: string;
  availability: LabelPrinterAvailability;
  output: LabelPrinterOutput;
  print: (job: LabelPrintJob) => Promise<LabelPrintResult>;
}

export const LABEL_SIZE_PRESETS: LabelSizePreset[] = [
  { id: "58x40", label: "58 × 40 mm", widthMm: 58, heightMm: 40 },
  { id: "50x30", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { id: "40x30", label: "40 × 30 mm", widthMm: 40, heightMm: 30 }
];

export const LABEL_PRINTER_CATALOG: Array<Pick<LabelPrinterAdapter, "id" | "label" | "availability" | "output">> = [
  { id: "preview", label: "Önizleme", availability: "available", output: "preview" },
  { id: "png", label: "PNG", availability: "available", output: "file" },
  { id: "pdf", label: "PDF", availability: "available", output: "file" },
  { id: "zpl", label: "ZPL", availability: "planned", output: "device" },
  { id: "tspl", label: "TSPL", availability: "planned", output: "device" },
  { id: "system", label: "Sistem Yazıcısı", availability: "planned", output: "device" }
];

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112"
] as const;

const CODE128_START_B = 104;
const CODE128_STOP = 106;
const CODE128_QUIET_MODULES = 10;
const DEFAULT_DPI = 300;
const MM_PER_INCH = 25.4;
const PDF_POINTS_PER_INCH = 72;
const textEncoder = new TextEncoder();

interface Code128Encoding {
  value: string;
  codes: number[];
  patterns: string[];
  totalModules: number;
}

export function canEncodeCode128B(value: string) {
  return value.length > 0 && [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code <= 126;
  });
}

function encodeCode128B(valueInput: string): Code128Encoding | null {
  const value = valueInput.trim();
  if (!canEncodeCode128B(value)) return null;

  const dataCodes = [...value].map((character) => character.charCodeAt(0) - 32);
  const checksum = (CODE128_START_B + dataCodes.reduce(
    (sum, code, index) => sum + (code * (index + 1)),
    0
  )) % 103;
  const codes = [CODE128_START_B, ...dataCodes, checksum, CODE128_STOP];
  const patterns = codes.map((code) => CODE128_PATTERNS[code] ?? "");
  const symbolModules = patterns.reduce(
    (sum, pattern) => sum + [...pattern].reduce((patternSum, width) => patternSum + Number(width), 0),
    0
  );

  return {
    value,
    codes,
    patterns,
    totalModules: symbolModules + (CODE128_QUIET_MODULES * 2)
  };
}

function pxFromMm(mm: number, dpi = DEFAULT_DPI) {
  return Math.max(1, Math.round((mm / MM_PER_INCH) * dpi));
}

function pointFromMm(mm: number) {
  return (mm / MM_PER_INCH) * PDF_POINTS_PER_INCH;
}

function normalizedCopies(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(50, Math.trunc(value)));
}

function normalizedJob(job: LabelPrintJob): LabelPrintJob {
  return {
    ...job,
    copies: normalizedCopies(job.copies),
    product: {
      name: job.product.name.trim().slice(0, 180) || "Ürün",
      sku: job.product.sku.trim().slice(0, 80),
      barcode: job.product.barcode.trim().slice(0, 80),
      salePrice: Math.max(0, Number(job.product.salePrice) || 0),
      currency: /^[A-Z]{3}$/.test(job.product.currency.toUpperCase())
        ? job.product.currency.toUpperCase()
        : "TRY"
    }
  };
}

function fileStem(job: LabelPrintJob) {
  const raw = job.product.sku || job.product.barcode || job.product.name || "etiket";
  const safe = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return safe || "etiket";
}

function priceText(job: LabelPrintJob) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: job.product.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(job.product.salePrice);
  } catch {
    return `${job.product.salePrice.toFixed(2)} ${job.product.currency}`;
  }
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  initialPx: number,
  minimumPx: number,
  weight: number
) {
  let size = initialPx;
  const family = '"IBM Plex Sans Variable", "Segoe UI", sans-serif';
  while (size > minimumPx) {
    context.font = `${weight} ${Math.round(size)}px ${family}`;
    if (context.measureText(value).width <= maxWidth) return;
    size -= 2;
  }
  context.font = `${weight} ${Math.round(minimumPx)}px ${family}`;
}

function drawCode128(
  context: CanvasRenderingContext2D,
  encoding: Code128Encoding,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const moduleWidth = width / encoding.totalModules;
  let cursor = x + (CODE128_QUIET_MODULES * moduleWidth);
  context.fillStyle = "#000000";

  for (const pattern of encoding.patterns) {
    let bar = true;
    for (const widthCharacter of pattern) {
      const runWidth = Number(widthCharacter) * moduleWidth;
      if (bar) context.fillRect(cursor, y, runWidth, height);
      cursor += runWidth;
      bar = !bar;
    }
  }
}

function renderLabelCanvas(jobInput: LabelPrintJob, dpi = DEFAULT_DPI) {
  const job = normalizedJob(jobInput);
  const canvas = document.createElement("canvas");
  canvas.width = pxFromMm(job.size.widthMm, dpi);
  canvas.height = pxFromMm(job.size.heightMm, dpi);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Etiket çizim yüzeyi oluşturulamadı.");

  const width = canvas.width;
  const height = canvas.height;
  const margin = Math.max(12, Math.round(Math.min(width, height) * 0.06));
  const innerWidth = width - (margin * 2);
  const compact = job.size.heightMm <= 30;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000000";
  context.textBaseline = "alphabetic";

  const nameSize = compact ? height * 0.105 : height * 0.095;
  fitText(context, job.product.name, innerWidth, nameSize, height * 0.06, 700);
  context.fillText(job.product.name, margin, margin + (nameSize * 0.9), innerWidth);

  let metaY = margin + (nameSize * 1.55);
  if (job.showSku && job.product.sku) {
    context.font = `500 ${Math.max(16, Math.round(height * 0.045))}px "IBM Plex Sans Variable", "Segoe UI", sans-serif`;
    context.fillText(`SKU: ${job.product.sku}`, margin, metaY, innerWidth);
    metaY += Math.max(20, Math.round(height * 0.055));
  }

  if (job.showPrice) {
    const value = priceText(job);
    const priceSize = compact ? height * 0.17 : height * 0.19;
    fitText(context, value, innerWidth, priceSize, height * 0.11, 800);
    context.fillText(value, margin, metaY + priceSize, innerWidth);
  }

  if (job.showBarcode && job.product.barcode) {
    const encoding = encodeCode128B(job.product.barcode);
    const barcodeTextSize = Math.max(14, Math.round(height * 0.035));
    const barcodeTextGap = Math.max(4, Math.round(height * 0.012));
    const barcodeBottom = height - margin - barcodeTextSize;
    const barcodeTop = compact ? height * 0.62 : height * 0.59;
    const barcodeHeight = Math.max(20, barcodeBottom - barcodeTextGap - barcodeTop);

    if (encoding) {
      drawCode128(context, encoding, margin, barcodeTop, innerWidth, barcodeHeight);
      context.font = `500 ${barcodeTextSize}px "IBM Plex Sans Variable", "Segoe UI", sans-serif`;
      context.textAlign = "center";
      context.fillText(job.product.barcode, width / 2, height - margin, innerWidth);
      context.textAlign = "start";
    } else {
      context.font = `600 ${barcodeTextSize}px "IBM Plex Sans Variable", "Segoe UI", sans-serif`;
      context.textAlign = "center";
      context.fillText(job.product.barcode, width / 2, height - margin, innerWidth);
      context.textAlign = "start";
    }
  }

  context.strokeStyle = "#000000";
  context.lineWidth = Math.max(1, Math.round(dpi / 150));
  context.strokeRect(1, 1, width - 2, height - 2);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Etiket dosyası üretilemedi."));
    }, type, quality);
  });
}

function ascii(value: string) {
  return textEncoder.encode(value);
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function jpegPdf(
  jpeg: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  widthMm: number,
  heightMm: number,
  copies: number
) {
  const pageWidth = pointFromMm(widthMm);
  const pageHeight = pointFromMm(heightMm);
  const pageCount = normalizedCopies(copies);
  const maxObjectId = 3 + (pageCount * 2);
  const objects = new Map<number, Uint8Array>();
  const pageIds = Array.from({ length: pageCount }, (_value, index) => 4 + (index * 2));

  objects.set(1, ascii("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, ascii(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`));
  objects.set(3, concatBytes([
    ascii(`<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`),
    jpeg,
    ascii("\nendstream")
  ]));

  for (let index = 0; index < pageCount; index += 1) {
    const pageId = pageIds[index];
    if (pageId === undefined) throw new Error(`PDF nesnesi eksik: ${4 + (index * 2)}`);
    const contentId = pageId + 1;
    const content = `q\n${pageWidth.toFixed(3)} 0 0 ${pageHeight.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
    objects.set(pageId, ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(3)} ${pageHeight.toFixed(3)}] /Resources << /XObject << /Im0 3 0 R >> >> /Contents ${contentId} 0 R >>`));
    objects.set(contentId, ascii(`<< /Length ${ascii(content).byteLength} >>\nstream\n${content}endstream`));
  }

  const chunks: Uint8Array[] = [new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10])];
  const offsets = new Array<number>(maxObjectId + 1).fill(0);
  let cursor = chunks[0]?.byteLength ?? 0;

  for (let id = 1; id <= maxObjectId; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`PDF nesnesi eksik: ${id}`);
    const prefix = ascii(`${id} 0 obj\n`);
    const suffix = ascii("\nendobj\n");
    offsets[id] = cursor;
    chunks.push(prefix, body, suffix);
    cursor += prefix.byteLength + body.byteLength + suffix.byteLength;
  }

  const xrefOffset = cursor;
  const xrefLines = ["xref", `0 ${maxObjectId + 1}`, "0000000000 65535 f "];
  for (let id = 1; id <= maxObjectId; id += 1) {
    xrefLines.push(`${String(offsets[id]).padStart(10, "0")} 00000 n `);
  }
  const trailer = `${xrefLines.join("\n")}\ntrailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(ascii(trailer));
  return concatBytes(chunks);
}

function previewPrinter(): LabelPrinterAdapter {
  return {
    id: "preview",
    label: "Önizleme",
    availability: "available",
    output: "preview",
    async print(jobInput) {
      const job = normalizedJob(jobInput);
      const canvas = renderLabelCanvas(job, 150);
      return {
        printerId: "preview",
        fileName: `${fileStem(job)}-${job.size.id}-preview.png`,
        mimeType: "image/png",
        previewDataUrl: canvas.toDataURL("image/png"),
        message: "Etiket önizlemesi hazır."
      };
    }
  };
}

function pngPrinter(): LabelPrinterAdapter {
  return {
    id: "png",
    label: "PNG",
    availability: "available",
    output: "file",
    async print(jobInput) {
      const job = normalizedJob(jobInput);
      const canvas = renderLabelCanvas(job);
      const blob = await canvasToBlob(canvas, "image/png");
      return {
        printerId: "png",
        fileName: `${fileStem(job)}-${job.size.id}.png`,
        mimeType: "image/png",
        blob,
        message: "PNG etiketi hazır."
      };
    }
  };
}

function pdfPrinter(): LabelPrinterAdapter {
  return {
    id: "pdf",
    label: "PDF",
    availability: "available",
    output: "file",
    async print(jobInput) {
      const job = normalizedJob(jobInput);
      const canvas = renderLabelCanvas(job);
      const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.96);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
      const pdfBytes = jpegPdf(
        jpegBytes,
        canvas.width,
        canvas.height,
        job.size.widthMm,
        job.size.heightMm,
        job.copies
      );
      return {
        printerId: "pdf",
        fileName: `${fileStem(job)}-${job.size.id}-${job.copies}x.pdf`,
        mimeType: "application/pdf",
        blob: new Blob([pdfBytes], { type: "application/pdf" }),
        message: `${job.copies} kopyalık PDF etiketi hazır.`
      };
    }
  };
}

function plannedPrinter(id: Exclude<LabelPrinterId, "preview" | "png" | "pdf">, label: string): LabelPrinterAdapter {
  return {
    id,
    label,
    availability: "planned",
    output: "device",
    async print() {
      throw new Error(`${label} adaptörü henüz etkin değil.`);
    }
  };
}

export function getLabelPrinter(id: LabelPrinterId): LabelPrinterAdapter {
  if (id === "preview") return previewPrinter();
  if (id === "png") return pngPrinter();
  if (id === "pdf") return pdfPrinter();
  if (id === "zpl") return plannedPrinter("zpl", "ZPL");
  if (id === "tspl") return plannedPrinter("tspl", "TSPL");
  return plannedPrinter("system", "Sistem Yazıcısı");
}

export function downloadLabelResult(result: LabelPrintResult) {
  if (!result.blob) throw new Error("İndirilecek etiket dosyası bulunamadı.");
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
