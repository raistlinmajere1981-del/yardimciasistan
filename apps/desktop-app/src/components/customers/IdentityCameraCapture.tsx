import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import {
  evaluateIdentityFrame,
  IDENTITY_CAMERA_ANALYSIS_HEIGHT,
  IDENTITY_CAMERA_ANALYSIS_WIDTH,
  IDENTITY_CAMERA_GUIDE_COVERAGE_MIN,
  IDENTITY_CAMERA_GUIDE_DENSITY_MIN,
  type IdentityFrameQuality
} from "../../app/identity-camera-quality";
import { announceIdentityCamera } from "../../app/identity-camera-feedback";
import {
  serializeRendererError,
  writeRendererDiagnostic
} from "../../app/diagnostics-client";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceSubflowOverlay } from "../workspace/WorkspaceSubflowOverlay";

type CaptureSide = "front" | "back";
type CapturePhase = "starting" | "capturing" | "processing" | "analysis-error" | "error";

type AnalysisResult = { ok: boolean; message: string; code?: string };

// Only temporary service failures warrant retrying an unchanged identity image.
// All other failures (including missing/unknown codes) require intervention.
const RETRYABLE_ANALYSIS_ERRORS = new Set([
  "analysis_connection_failed", "analysis_timeout", "provider_timeout",
  "provider_unavailable", "provider_rate_limited"
]);

interface IdentityCameraCaptureProps {
  captureBackSide: boolean;
  onClose: () => void;
  onCaptured: (files: File[]) => Promise<AnalysisResult>;
}

interface CandidateFrame {
  file: File;
  score: number;
}

export function IdentityCameraCapture({
  captureBackSide,
  onClose,
  onCaptured
}: IdentityCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontFileRef = useRef<File | null>(null);
  const pendingFilesRef = useRef<File[]>([]);
  const retryAttemptsRef = useRef(0);
  const previousLumaRef = useRef<Uint8Array | null>(null);
  const stableFramesRef = useRef(0);
  const candidatesRef = useRef<CandidateFrame[]>([]);
  const captureBusyRef = useRef(false);
  const processingRef = useRef(false);
  const stableSpeechRef = useRef(false);

  const [side, setSide] = useState<CaptureSide>("front");
  const [phase, setPhase] = useState<CapturePhase>("starting");
  const [status, setStatus] = useState("Kamera hazırlanıyor...");
  const [quality, setQuality] = useState<IdentityFrameQuality | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);
  const [canRetryAnalysis, setCanRetryAnalysis] = useState(false);
  const [analysisErrorCode, setAnalysisErrorCode] = useState("");

  const resetSampling = useCallback(() => {
    previousLumaRef.current = null;
    stableFramesRef.current = 0;
    candidatesRef.current = [];
    captureBusyRef.current = false;
    stableSpeechRef.current = false;
    setQuality(null);
    setCandidateCount(0);
  }, []);

  const analyzeCapturedFiles = useCallback(async (files: File[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    pendingFilesRef.current = files;
    setCanRetryAnalysis(false);
    setPhase("processing");
    setStatus(files.length > 1 ? "Ön ve arka yüz alındı. Kimlik bilgileri okunuyor..." : "Kimlik alındı. Bilgiler okunuyor...");
    announceIdentityCamera("Kimlik alındı.", "ready");

    let result: AnalysisResult;
    try {
      result = await onCaptured(files);
    } catch {
      result = { ok: false, code: "analysis_failed", message: "Kimlik görseli okunamadı." };
    }
    if (result.ok) {
      pendingFilesRef.current = [];
      frontFileRef.current = null;
      setStatus(result.message);
      announceIdentityCamera("İşlem tamam.", "success");
      onClose();
      return;
    }

    // Stop sampling on every analysis error. Never send another AI request
    // automatically, even when a persistent provider failure repeats.
    setAnalysisErrorCode(result.code ?? "");
    setCanRetryAnalysis(RETRYABLE_ANALYSIS_ERRORS.has(result.code ?? "") && retryAttemptsRef.current < 1);
    setPhase("analysis-error");
    setStatus(result.message);
    announceIdentityCamera("Kimlik analizi tamamlanamadı.", "error");
    processingRef.current = false;
  }, [onCaptured, onClose]);

  const finishSide = useCallback(async (file: File) => {
    if (processingRef.current) return;

    if (side === "front" && captureBackSide) {
      processingRef.current = true;
      frontFileRef.current = file;
      resetSampling();
      setSide("back");
      setStatus("Ön yüz alındı. Kimliği çevirin ve arka yüzünü çerçeveye yerleştirin.");
      announceIdentityCamera("Kimliği çevirin.", "prompt");
      processingRef.current = false;
      return;
    }

    const files = frontFileRef.current ? [frontFileRef.current, file] : [file];
    await analyzeCapturedFiles(files);
  }, [analyzeCapturedFiles, captureBackSide, resetSampling, side]);

  const retryAnalysis = useCallback(() => {
    if (phase !== "analysis-error" || !canRetryAnalysis || processingRef.current || pendingFilesRef.current.length === 0) return;
    retryAttemptsRef.current += 1;
    void analyzeCapturedFiles(pendingFilesRef.current);
  }, [analyzeCapturedFiles, canRetryAnalysis, phase]);

  const recapture = useCallback(() => {
    if (phase !== "analysis-error" || processingRef.current) return;
    pendingFilesRef.current = [];
    frontFileRef.current = null;
    retryAttemptsRef.current = 0;
    setCanRetryAnalysis(false);
    setAnalysisErrorCode("");
    resetSampling();
    setSide("front");
    setPhase("capturing");
    setStatus("Kimliği yeniden kameraya gösterin.");
  }, [phase, resetSampling]);

  const closeCamera = useCallback(() => {
    if (processingRef.current) return;
    pendingFilesRef.current = [];
    frontFileRef.current = null;
    onClose();
  }, [onClose]);

  const captureManual = useCallback(async () => {
    if (phase !== "capturing" || processingRef.current || captureBusyRef.current || !videoRef.current) return;
    captureBusyRef.current = true;
    candidatesRef.current = [];
    setCandidateCount(0);
    try {
      const file = await captureVideoFrame(videoRef.current, side);
      await finishSide(file);
    } catch (error) {
      writeRendererDiagnostic({
        level: "ERROR",
        scope: "identity-camera",
        event: "identity-camera.capture.failed",
        message: "Kimlik kamerasından manuel fotoğraf alınamadı.",
        error: serializeRendererError(error)
      });
      setStatus("Fotoğraf alınamadı. Kamerayı sabit tutup yeniden deneyin.");
    } finally {
      captureBusyRef.current = false;
    }
  }, [finishSide, phase, side]);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        writeRendererDiagnostic({
          level: "WARN",
          scope: "identity-camera",
          event: "identity-camera.api.unavailable",
          message: "Renderer ortamında getUserMedia kamera API'si kullanılamıyor.",
          meta: {
            secureContext: window.isSecureContext
          }
        });
        setPhase("error");
        setStatus("Bu sistemde kamera erişimi kullanılamıyor. Dosyadan kimlik görseli seçebilirsiniz.");
        return;
      }

      writeRendererDiagnostic({
        level: "INFO",
        scope: "identity-camera",
        event: "identity-camera.start.requested",
        message: "Kimlik kamerası başlatılıyor.",
        meta: {
          secureContext: window.isSecureContext
        }
      });

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 2560 },
            height: { ideal: 1440 }
          }
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        const videoTrack = stream.getVideoTracks()[0];
        const trackSettings = videoTrack?.getSettings();
        writeRendererDiagnostic({
          level: "INFO",
          scope: "identity-camera",
          event: "identity-camera.started",
          message: "Kimlik kamerası başarıyla başlatıldı.",
          meta: {
            trackLabel: videoTrack?.label ?? "",
            width: trackSettings?.width ?? 0,
            height: trackSettings?.height ?? 0,
            frameRate: trackSettings?.frameRate ?? 0,
            facingMode: trackSettings?.facingMode ?? ""
          }
        });

        setPhase("capturing");
        setStatus("Kimliği kameraya gösterin.");
        announceIdentityCamera("Kimliği kameraya gösterin.", "prompt");
      } catch (error) {
        setPhase("error");
        writeRendererDiagnostic({
          level: "ERROR",
          scope: "identity-camera",
          event: "identity-camera.start.failed",
          message: "Kimlik kamerası başlatılamadı.",
          meta: {
            secureContext: window.isSecureContext
          },
          error: serializeRendererError(error)
        });
        void writeCameraDeviceSnapshot();

        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setStatus("Kamera izni verilmedi. Windows kamera gizliliği ve masaüstü uygulama iznini kontrol edin veya dosyadan görsel seçin.");
        } else if (error instanceof DOMException && error.name === "NotFoundError") {
          setStatus("Kullanılabilir bir kamera bulunamadı. Dosyadan kimlik görseli seçebilirsiniz.");
        } else if (error instanceof DOMException && error.name === "NotReadableError") {
          setStatus("Kamera işletim sistemi tarafından açılamadı. Kamerayı kullanan başka bir uygulama varsa kapatıp yeniden deneyin.");
        } else if (error instanceof DOMException && error.name === "SecurityError") {
          setStatus("Kamera erişimi güvenlik ayarları tarafından engellendi. Sistem kamera izinlerini kontrol edin.");
        } else {
          setStatus("Kamera başlatılamadı. Dosyadan kimlik görseli seçebilirsiniz.");
        }
      }
    }

    void startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "capturing") return;

    const canvas = analysisCanvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !video || !context) return;

    canvas.width = IDENTITY_CAMERA_ANALYSIS_WIDTH;
    canvas.height = IDENTITY_CAMERA_ANALYSIS_HEIGHT;
    let animationFrame = 0;
    let lastSampleAt = 0;
    let cancelled = false;

    const sample = async (timestamp: number) => {
      animationFrame = requestAnimationFrame((nextTimestamp) => void sample(nextTimestamp));
      if (cancelled || timestamp - lastSampleAt < 160 || captureBusyRef.current || processingRef.current) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      lastSampleAt = timestamp;

      drawVideoCover(context, video, canvas.width, canvas.height);
      const frame = evaluateIdentityFrame(
        context.getImageData(0, 0, canvas.width, canvas.height),
        previousLumaRef.current
      );
      previousLumaRef.current = frame.luma;
      setQuality(frame);
      setStatus(frame.hint);

      if (!frame.acceptable) {
        stableFramesRef.current = 0;
        candidatesRef.current = [];
        setCandidateCount(0);
        stableSpeechRef.current = false;
        return;
      }

      stableFramesRef.current += 1;
      if (!stableSpeechRef.current) {
        stableSpeechRef.current = true;
        announceIdentityCamera("Sabit tutun.", "ready");
      }
      if (stableFramesRef.current < 3 || candidatesRef.current.length >= 3) return;

      captureBusyRef.current = true;
      try {
        const file = await captureVideoFrame(video, side);
        if (cancelled) return;
        candidatesRef.current.push({ file, score: frame.score });
        setCandidateCount(candidatesRef.current.length);

        if (candidatesRef.current.length >= 3) {
          const best = [...candidatesRef.current].sort((left, right) => right.score - left.score)[0];
          if (!best) return;
          candidatesRef.current = [];
          stableFramesRef.current = 0;
          setCandidateCount(0);
          await finishSide(best.file);
        }
      } catch {
        stableFramesRef.current = 0;
        candidatesRef.current = [];
        setCandidateCount(0);
        setStatus("Fotoğraf alınamadı. Kimliği sabit tutup yeniden deneyin.");
      } finally {
        captureBusyRef.current = false;
      }
    };

    animationFrame = requestAnimationFrame((timestamp) => void sample(timestamp));
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [finishSide, phase, side]);

  useEffect(() => {
    const handleSpace = (event: KeyboardEvent) => {
      if (event.code !== "Space" || phase !== "capturing") return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, input, select, textarea, a[href]")) return;
      event.preventDefault();
      event.stopPropagation();
      void captureManual();
    };
    window.addEventListener("keydown", handleSpace, true);
    return () => window.removeEventListener("keydown", handleSpace, true);
  }, [captureManual, phase]);

  const qualitySummary = quality
    ? [
        ["Keskinlik", quality.sharpness >= 80],
        ["Hareket", quality.motion <= 0.04],
        ["Işık", quality.brightness >= 48 && quality.brightness <= 220 && quality.clipping <= 0.4],
        ["Kadraj", quality.guideCoverage >= IDENTITY_CAMERA_GUIDE_COVERAGE_MIN && quality.guideDensity >= IDENTITY_CAMERA_GUIDE_DENSITY_MIN]
      ] as const
    : [];

  return <WorkspaceSubflowOverlay
    title="Kimliği kameradan tara"
    className="identity-camera-overlay"
    closeBlocked={phase === "processing"}
    onClose={closeCamera}
    footer={<div className="identity-camera__footer">
      <span className="identity-camera__shortcut">{phase === "capturing" ? "Space: fotoğraf çek · Esc: iptal" : "Esc: iptal"}</span>
      <div className="action-row">
        <ActionButton variant="secondary" type="button" disabled={phase === "processing"} onClick={closeCamera}>İptal</ActionButton>
        {phase === "analysis-error" && <>
          <ActionButton variant="secondary" type="button" onClick={recapture}>Yeniden Çek</ActionButton>
          {canRetryAnalysis && <ActionButton type="button" onClick={retryAnalysis}>Tekrar Dene</ActionButton>}
        </>}
        {phase === "capturing" && <ActionButton type="button" onClick={() => void captureManual()}>
          <Camera size={16} aria-hidden="true" />Fotoğraf çek
        </ActionButton>}
      </div>
    </div>}
  >
    <div className="identity-camera">
      <div className="identity-camera__viewport">
        <video ref={videoRef} muted playsInline />
        <div className={`identity-camera__guide identity-camera__guide--${side}`} aria-hidden="true">
          <span>{side === "front" ? "Ön yüz" : "Arka yüz"}</span>
        </div>
        {phase !== "capturing" && <div className="identity-camera__viewport-state">
          <ScanLine size={26} aria-hidden="true" />
          <strong>{phase === "processing" ? "Kimlik okunuyor" : phase === "analysis-error" ? "AI analizi tamamlanamadı" : phase === "error" ? "Kamera kullanılamıyor" : "Kamera hazırlanıyor"}</strong>
        </div>}
      </div>

      <div className="identity-camera__status" role={phase === "error" || phase === "analysis-error" ? "alert" : "status"} aria-live="polite">
        <strong>{side === "front" ? "Kimliğin ön yüzü" : "Kimliğin arka yüzü"}</strong>
        <span>{status}</span>
      </div>

      {phase === "analysis-error" && <p className="identity-camera__flow-note">
        {canRetryAnalysis
          ? "Geçici bir AI hatası oluştu. Aynı görüntülerle bir kez daha deneyebilirsiniz."
          : retryAttemptsRef.current > 0
            ? "Tekrar deneme de başarısız oldu. İşlem durduruldu; bağlantıyı veya AI ayarlarını kontrol edin."
            : ["invalid_image", "image_unreadable", "image_missing", "image_too_large", "unsupported_image_type"].includes(analysisErrorCode)
              ? "Görsel işlenemedi. Yeniden fotoğraf çekebilir veya bilgileri elle girebilirsiniz."
              : "Bu hata yeniden denemeyle düzelmeyebilir. AI bağlantı ve yetki ayarlarını kontrol edin veya bilgileri elle girin."}
        {" "}Görüntüler yalnız bu pencere açıkken korunur; iptal edince temizlenir.
      </p>}

      {phase === "capturing" && <div className="identity-camera__quality" aria-label="Görüntü kalitesi">
        {qualitySummary.map(([label, ready]) => <span className={ready ? "is-ready" : ""} key={label}>
          <i aria-hidden="true" />{label}
        </span>)}
        {candidateCount > 0 && <span className="identity-camera__candidate-count">{candidateCount}/3 iyi kare</span>}
      </div>}

      {captureBackSide && phase === "capturing" && <p className="identity-camera__flow-note">
        Ön yüz otomatik alındıktan sonra kimliği çevirmeniz istenecek. İki yüz de çekilmeden AI analizi başlamaz.
      </p>}

      <canvas ref={analysisCanvasRef} className="identity-camera__analysis-canvas" aria-hidden="true" />
    </div>
  </WorkspaceSubflowOverlay>;
}

async function writeCameraDeviceSnapshot() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    writeRendererDiagnostic({
      level: "INFO",
      scope: "identity-camera",
      event: "identity-camera.devices.snapshot",
      message: "Kamera başlatma hatası sonrası medya aygıtları sayıldı.",
      meta: {
        videoInputCount: videoInputs.length,
        labeledVideoInputCount: videoInputs.filter((device) => Boolean(device.label)).length
      }
    });
  } catch (error) {
    writeRendererDiagnostic({
      level: "WARN",
      scope: "identity-camera",
      event: "identity-camera.devices.inspect.failed",
      message: "Kamera hatası sonrası medya aygıtları listelenemedi.",
      error: serializeRendererError(error)
    });
  }
}

async function captureVideoFrame(video: HTMLVideoElement, side: CaptureSide): Promise<File> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("camera_frame_unavailable");
  }

  const maxDimension = 2560;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("camera_canvas_unavailable");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob || blob.size <= 0) throw new Error("camera_blob_unavailable");

  return new File(
    [blob],
    `identity-${side}-${Date.now()}.jpg`,
    { type: "image/jpeg", lastModified: Date.now() }
  );
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceAspect > targetAspect) {
    sw = sourceHeight * targetAspect;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceAspect < targetAspect) {
    sh = sourceWidth / targetAspect;
    sy = (sourceHeight - sh) / 2;
  }
  context.drawImage(video, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}
