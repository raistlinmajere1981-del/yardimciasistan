import { SearchSelect } from "../ui/SearchSelect";
import { observeNexaAi } from "../../app/nexa-activity";
import { Camera, FileImage, Plus, RotateCw, Sparkles, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogProduct, StockImageAnalysis, StockImageConfidence } from "@yardimci-asistan/shared";
import type { DesktopDashboardData } from "../../../electron/database";
import { ActionButton } from "../ui/ActionButton";
import { StatusBadge } from "../ui/StatusBadge";
import { ModalSurface } from "../ui/ModalSurface";
import { IconButton } from "../ui/IconButton";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface StockImageImportWorkspaceProps {
  products: CatalogProduct[];
  onApplied: (data: DesktopDashboardData) => void;
}

interface ReviewLine {
  id: string;
  rawText: string;
  productId: string;
  quantity: string;
  confidence: StockImageConfidence;
  reason: string;
  ignored: boolean;
}

type WorkspaceStage = "image" | "analyzing" | "review" | "success";

export function StockImageImportWorkspace({ products, onApplied }: StockImageImportWorkspaceProps) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<WorkspaceStage>("image");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rotation, setRotation] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<StockImageAnalysis | null>(null);
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [activeImportId, setActiveImportId] = useState("");
  const [imageHash, setImageHash] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [successSummary, setSuccessSummary] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisAttemptRef = useRef(0);
  const trackedItems = useMemo(() => products.filter(product => product.isActive && product.trackInventory)
    .map(product => ({ id: product.id, name: product.name, stock_unit: product.unit })), [products]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cameraStream) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => setError("Web kamera önizlemesi başlatılamadı. Bilgisayardan görsel seçebilirsiniz."));
  }, [cameraStream]);

  useEffect(() => () => stopCameraStream(cameraStream), [cameraStream]);

  const applicableLines = reviewLines.filter((line) => !line.ignored && isValidReviewLine(line));
  const needsReviewCount = reviewLines.filter((line) => !line.ignored && !isValidReviewLine(line)).length;
  const totalQuantitySummary = formatStockTotals(applicableLines, trackedItems);

  function resetWorkspace() {
    analysisAttemptRef.current += 1;
    stopCamera();
    setStage("image");
    setSelectedFile(null);
    setRotation(0);
    setMessage("");
    setError("");
    setAnalysis(null);
    setReviewLines([]);
    setActiveImportId("");
    setImageHash("");
    setDuplicateWarning(false);
    setDuplicateAcknowledged(false);
    setSuccessSummary("");
  }

  function closeWorkspace() {
    if (stage !== "success" && activeImportId) {
      void window.yardimciDesktop?.cancelStockImageAnalysis(activeImportId);
    }
    resetWorkspace();
    setOpen(false);
  }

  async function startCamera() {
    setError("");
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Bu cihazda web kamera kullanılamıyor. Bilgisayardan görsel seçebilirsiniz.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setCameraStream(stream);
      setSelectedFile(null);
      setRotation(0);
    } catch {
      setError("Kamera izni alınamadı. Bilgisayardan görsel seçme seçeneğini kullanabilirsiniz.");
    }
  }

  function stopCamera() {
    stopCameraStream(cameraStream);
    setCameraStream(null);
  }

  async function captureCameraFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      setError("Kamera görüntüsü henüz hazır değil.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Kamera görüntüsü alınamadı.");
      return;
    }
    context.drawImage(video, 0, 0);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    setSelectedFile(new File([blob], `kamera-${Date.now()}.jpg`, { type: "image/jpeg" }));
    setRotation(0);
    stopCamera();
  }

  function selectImage(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError("Desteklenmeyen dosya türü. JPG, PNG veya WebP seçin.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Görsel çok büyük. En fazla 10 MB boyutunda bir görsel seçin.");
      return;
    }
    stopCamera();
    setSelectedFile(file);
    setRotation(0);
  }

  async function analyzeImage() {
    const bridge = window.yardimciDesktop;
    if (!selectedFile || !bridge?.analyzeStockImage) {
      setError("Görsel analiz bağlantısı kullanılamıyor.");
      return;
    }
    const attempt = analysisAttemptRef.current + 1;
    analysisAttemptRef.current = attempt;
    const importId = `stock_import_${crypto.randomUUID()}`;
    setActiveImportId(importId);
    setStage("analyzing");
    setError("");
    setMessage("Görsel güvenli analiz hizmetine gönderiliyor…");
    try {
      const prepared = await prepareImage(selectedFile, rotation);
      if (analysisAttemptRef.current !== attempt) return;
      const result = await observeNexaAi(async () => bridge.analyzeStockImage({
        importId,
        fileName: prepared.name,
        mimeType: prepared.type,
        bytes: await prepared.arrayBuffer()
      }), "response", () => analysisAttemptRef.current === attempt);
      if (analysisAttemptRef.current !== attempt) return;
      if (!result.ok) {
        setStage("image");
        setError(result.message);
        setMessage("");
        setActiveImportId("");
        return;
      }
      setAnalysis(result.analysis);
      setReviewLines(result.analysis.lines.map((line) => ({
        id: crypto.randomUUID(),
        rawText: line.raw_text,
        productId: line.matched_product_id ?? "",
        quantity: line.suggested_quantity === null ? "" : String(line.suggested_quantity),
        confidence: line.confidence,
        reason: line.needs_review_reason ?? "",
        ignored: false
      })));
      setImageHash(result.imageHash);
      setDuplicateWarning(result.duplicateWarning);
      setDuplicateAcknowledged(false);
      setMessage(result.message);
      setStage("review");
    } catch {
      if (analysisAttemptRef.current === attempt) {
        setStage("image");
        setMessage("");
        setError("Görsel hazırlanamadı veya analiz edilemedi.");
        setActiveImportId("");
      }
    }
  }

  function cancelAnalysis() {
    analysisAttemptRef.current += 1;
    if (activeImportId) void window.yardimciDesktop?.cancelStockImageAnalysis(activeImportId);
    setStage("image");
    setMessage("");
    setError("Görsel analizi iptal edildi.");
    setActiveImportId("");
  }

  function returnToImage() {
    if (activeImportId) void window.yardimciDesktop?.cancelStockImageAnalysis(activeImportId);
    setStage("image");
    setAnalysis(null);
    setReviewLines([]);
    setActiveImportId("");
    setImageHash("");
    setDuplicateWarning(false);
    setDuplicateAcknowledged(false);
    setMessage("");
    setError("");
  }

  function updateLine(id: string, patch: Partial<ReviewLine>) {
    setReviewLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  }

  function addManualLine() {
    setReviewLines((current) => [...current, {
      id: crypto.randomUUID(),
      rawText: "Manuel eklenen satır",
      productId: "",
      quantity: "",
      confidence: "low",
      reason: "Ürün ve miktar kullanıcı tarafından girilmeli.",
      ignored: false
    }]);
  }

  async function applyImport() {
    const bridge = window.yardimciDesktop;
    if (!bridge?.applyStockImageImport || !activeImportId || !imageHash) {
      setError("Görsel stok taslağı uygulanamıyor.");
      return;
    }
    if (duplicateWarning && !duplicateAcknowledged) {
      setError("Devam etmeden önce çift belge uyarısını onaylayın.");
      return;
    }
    if (applicableLines.length === 0) {
      setError("Uygulanacak geçerli stok satırı bulunamadı. Ürün ve pozitif tam sayı miktar girin.");
      return;
    }
    setError("");
    setMessage("Stoklar tek işlem içinde güncelleniyor…");
    const result = await observeNexaAi(() => bridge.applyStockImageImport({
      importId: activeImportId,
      imageHash,
      duplicateWarningAcknowledged: duplicateAcknowledged,
      lines: applicableLines.map((line) => ({
        product_id: line.productId,
        quantity: Number(line.quantity),
        raw_text: line.rawText,
        confidence: line.confidence
      }))
    }), "success");
    if (!result.ok) {
      setError(result.message);
      setMessage("");
      return;
    }
    onApplied(result.dashboardData);
    setSuccessSummary(`${result.appliedLineCount} satırda ${totalQuantitySummary} stok eklendi.`);
    setMessage(result.message);
    setStage("success");
  }

  return (
    <>
      <ActionButton className="stock-image-import-trigger" variant="secondary" size="sm" onClick={() => { resetWorkspace(); setOpen(true); }}>
        <Sparkles size={16} aria-hidden="true" /> AI ile Stok Ekle
      </ActionButton>
      {open && (
        <ModalSurface className="stock-image-dialog" labelledBy="stock-image-title" onClose={closeWorkspace}>
          <header className="stock-image-header workspace-frame__header">
            <div><span>Güvenli stok taslağı</span><h2 id="stock-image-title">AI ile Stok Ekle</h2></div>
            <IconButton type="button" data-modal-initial-focus onClick={closeWorkspace} aria-label="Stok görseli ekranını kapat"><X size={20} /></IconButton>
          </header>
          <div className="stock-image-steps" aria-label="İçe aktarma aşamaları">
            <span className={stage === "image" ? "is-active" : "is-done"}>1 · Görsel</span>
            <span className={stage === "analyzing" ? "is-active" : ["review", "success"].includes(stage) ? "is-done" : ""}>2 · Analiz</span>
            <span className={stage === "review" ? "is-active" : stage === "success" ? "is-done" : ""}>3 · Kontrol</span>
          </div>
          {stage === "image" && (
            <div className="stock-image-content">
              <div className="stock-image-source-actions">
                <ActionButton size="sm" onClick={() => void startCamera()}><Camera size={17} /> Web kameradan çek</ActionButton>
                <ActionButton variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><FileImage size={17} /> Bilgisayardan seç</ActionButton>
                <input ref={fileInputRef} className="stock-image-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { selectImage(event.target.files?.[0]); event.currentTarget.value = ""; }} />
              </div>
              <div className="stock-image-preview">
                {cameraStream ? <video ref={videoRef} muted playsInline aria-label="Web kamera önizlemesi" /> : previewUrl ? <img src={previewUrl} alt="Seçilen fatura veya fiş önizlemesi" style={{ transform: `rotate(${rotation}deg)` }} /> : <div className="stock-image-empty"><FileImage size={44} /><strong>Fatura veya fiş görseli seçin</strong><span>JPG, PNG veya WebP · en fazla 10 MB</span></div>}
              </div>
              {cameraStream && <ActionButton className="stock-camera-capture" size="sm" onClick={() => void captureCameraFrame()}>Fotoğrafı Çek</ActionButton>}
              {selectedFile && <div className="stock-image-preview-actions"><ActionButton variant="secondary" size="sm" onClick={() => setRotation((current) => (current + 90) % 360)}><RotateCw size={16} /> 90° döndür</ActionButton><ActionButton variant="secondary" size="sm" onClick={() => void startCamera()}><Camera size={16} /> Yeniden çek</ActionButton><ActionButton variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}><FileImage size={16} /> Başka görsel seç</ActionButton></div>}
              <p className="stock-image-privacy">Görsel, analiz için işletmenizin yapılandırdığı AI sağlayıcısına gönderilir; uygulama görseli kalıcı saklamaz.</p>
              {error && <p className="stock-image-error status-message status-message--danger" role="alert">{error}</p>}
              <footer className="stock-image-footer"><ActionButton variant="secondary" size="sm" onClick={closeWorkspace}>Manuel stok ekranına dön</ActionButton><ActionButton size="sm" disabled={!selectedFile} onClick={() => void analyzeImage()}>Analiz Et</ActionButton></footer>
            </div>
          )}
          {stage === "analyzing" && <div className="stock-image-analyzing"><span className="stock-image-spinner" aria-hidden="true" /><h3>Görsel analiz ediliyor</h3><p>{message}</p><p>Bu aşamada stoklarınız değişmez.</p><ActionButton variant="secondary" size="sm" onClick={cancelAnalysis}>İptal</ActionButton></div>}
          {stage === "review" && (
            <div className="stock-image-review">
              <div className="stock-image-document"><div><span>Tedarikçi</span><strong>{analysis?.document.supplier_name || "Okunamadı"}</strong></div><div><span>Belge no</span><strong>{analysis?.document.invoice_number || "Okunamadı"}</strong></div><div><span>Tarih</span><strong>{analysis?.document.invoice_date || "Okunamadı"}</strong></div></div>
              {message && <p className="stock-image-info status-message status-message--info" role="status">{message}</p>}
              {duplicateWarning && <label className="stock-image-duplicate-warning"><input type="checkbox" checked={duplicateAcknowledged} onChange={(event) => setDuplicateAcknowledged(event.target.checked)} /><span><strong>Bu görsel daha önce stok girişinde kullanılmış olabilir.</strong> Yönetici olarak yine de uygulamak istediğimi onaylıyorum.</span></label>}
              <div className="stock-image-table" role="table" aria-label="AI stok eşleştirme taslağı">
                <div className="stock-image-table-head" role="row"><span>Faturada okunan</span><span>Ürün karşılığı</span><span>Eklenecek miktar</span><span>Güven</span><span>İşlem</span></div>
                {reviewLines.map(line => <div className={`stock-image-row${line.ignored ? " is-ignored" : ""}`} role="row" key={line.id}>
                  <div><strong>{line.rawText}</strong>{line.reason && <small>{line.reason}</small>}</div>
                  <label><span className="stock-image-mobile-label">Ürün karşılığı</span>
                    <SearchSelect ariaLabel={`Ürün karşılığı ${line.rawText}`} disabled={line.ignored} value={line.productId} placeholder="Eşleşme yok"
                      onChange={productId => updateLine(line.id, { productId })} options={trackedItems.map(item => ({ id: item.id, label: item.name, description: stockUnitLabel(item.stock_unit) }))} />
                  </label>
                  <label><span className="stock-image-mobile-label">Eklenecek miktar</span>
                    <input aria-label={`Eklenecek miktar (${stockUnitLabel(trackedItems.find(item => item.id === line.productId)?.stock_unit ?? "piece")})`}
                      disabled={line.ignored} type="number" min="0.0001" step="0.0001" inputMode="decimal" value={line.quantity}
                      onChange={event => updateLine(line.id, { quantity: event.target.value })} placeholder="Boş" />
                  </label>
                  <StatusBadge className="stock-confidence" tone={stockConfidenceTone(line.confidence)}>{confidenceLabel(line.confidence)}</StatusBadge>
                  <ActionButton variant="ghost" size="sm" onClick={() => updateLine(line.id, { ignored: !line.ignored })}>{line.ignored ? <><Undo2 size={15} /> Geri al</> : "Yok say"}</ActionButton>
                </div>)}
                {reviewLines.length === 0 && <p className="stock-image-no-lines">Eşleşen satır bulunamadı. Manuel bir satır ekleyebilirsiniz.</p>}
              </div>
              <ActionButton className="stock-image-add-line" variant="secondary" size="sm" onClick={addManualLine}><Plus size={16} /> Manuel satır ekle</ActionButton>
              {error && <p className="stock-image-error status-message status-message--danger" role="alert">{error}</p>}
              <footer className="stock-image-review-footer"><div><strong>{applicableLines.length}</strong><span>uygulanacak satır</span></div><div><strong>{totalQuantitySummary}</strong><span>toplam miktar</span></div><div><strong>{needsReviewCount}</strong><span>kontrol gerekli</span></div><ActionButton variant="secondary" size="sm" onClick={returnToImage}>Görsele dön</ActionButton><ActionButton size="sm" disabled={applicableLines.length === 0 || (duplicateWarning && !duplicateAcknowledged)} onClick={() => void applyImport()}>Stokları Güncelle</ActionButton></footer>
            </div>
          )}
          {stage === "success" && <div className="stock-image-success"><Sparkles size={42} /><h3>Stok girişi tamamlandı</h3><p>{successSummary}</p><ActionButton onClick={closeWorkspace}>Kapat</ActionButton></div>}
        </ModalSurface>
      )}
    </>
  );
}

function isValidReviewLine(line: ReviewLine): boolean {
  const quantity = Number(line.quantity);
  return Boolean(line.productId) && Number.isFinite(quantity) && quantity > 0 && quantity <= 100_000 && Math.round(quantity * 10000) / 10000 === quantity;
}

function confidenceLabel(confidence: StockImageConfidence): string {
  if (confidence === "high") return "Yüksek";
  if (confidence === "medium") return "Orta";
  return "Düşük";
}

function stockConfidenceTone(confidence: StockImageConfidence) {
  if (confidence === "high") return "success" as const;
  if (confidence === "medium") return "warning" as const;
  return "danger" as const;
}

function stockUnitLabel(unit: string): string {
  return unit === "piece" ? "adet" : unit;
}

function formatStockTotals(lines: ReviewLine[], items: Array<{ id: string; stock_unit: string }>): string {
  const totals = lines.reduce((result, line) => {
    const unit = items.find((item) => item.id === line.productId)?.stock_unit ?? "piece";
    result[unit] = (result[unit] ?? 0) + (Number(line.quantity) || 0);
    return result;
  }, {} as Record<string, number>);
  return Object.entries(totals).filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => `${new Intl.NumberFormat("tr-TR").format(quantity)} ${stockUnitLabel(unit)}`).join(" + ") || "0";
}

function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function prepareImage(source: File, rotation: number): Promise<File> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = rotation % 180 !== 0 ? height : width;
    canvas.height = rotation % 180 !== 0 ? width : height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(bitmap, -width / 2, -height / 2, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
    const name = source.name.replace(/\.[^.]+$/, "") || "stok-belgesi";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image_encode_failed")), type, quality));
}
