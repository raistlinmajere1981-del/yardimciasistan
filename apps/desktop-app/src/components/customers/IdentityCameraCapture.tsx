import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import {
  evaluateIdentityFrame,
  IDENTITY_CAMERA_ANALYSIS_HEIGHT,
  IDENTITY_CAMERA_ANALYSIS_WIDTH,
  type IdentityFrameQuality
} from "../../app/identity-camera-quality";
import { ActionButton } from "../ui/ActionButton";
import { WorkspaceSubflowOverlay } from "../workspace/WorkspaceSubflowOverlay";

type CaptureSide = "front" | "back";
type CapturePhase = "starting" | "capturing" | "processing" | "error";

interface IdentityCameraCaptureProps {
  captureBackSide: boolean;
  onClose: () => void;
  onCaptured: (files: File[]) => Promise<{ ok: boolean; message: string }>;
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

  const resetSampling = useCallback(() => {
    previousLumaRef.current = null;
    stableFramesRef.current = 0;
    candidatesRef.current = [];
    captureBusyRef.current = false;
    stableSpeechRef.current = false;
    setQuality(null);
    setCandidateCount(0);
  }, []);

  const finishSide = useCallback(async (file: File) => {
    if (processingRef.current) return;
    processingRef.current = true;

    if (side === "front" && captureBackSide) {
      frontFileRef.current = file;
      resetSampling();
      setSide("back");
      setStatus("Ön yüz alındı. Kimliği çevirin ve arka yüzünü çerçeveye yerleştirin.");
      speak("Kimliği çevirin.");
      processingRef.current = false;
      return;
    }

    const files = frontFileRef.current ? [frontFileRef.current, file] : [file];
    setPhase("processing");
    setStatus(files.length > 1 ? "Ön ve arka yüz alındı. Kimlik bilgileri okunuyor..." : "Kimlik alındı. Bilgiler okunuyor...");
    speak("Kimlik alındı.");

    const result = await onCaptured(files);
    if (result.ok) {
      setStatus(result.message);
      speak("İşlem tamam.");
      onClose();
      return;
    }

    frontFileRef.current = null;
    resetSampling();
    setSide("front");
    setPhase("capturing");
    setStatus(`${result.message} Kimliği yeniden gösterin.`);
    speak("Kimlik okunamadı, tekrar deneyin.");
    processingRef.current = false;
  }, [captureBackSide, onCaptured, onClose, resetSampling, side]);

  const captureManual = useCallback(async () => {
    if (phase !== "capturing" || processingRef.current || captureBusyRef.current || !videoRef.current) return;
    captureBusyRef.current = true;
    candidatesRef.current = [];
    setCandidateCount(0);
    try {
      const file = await captureVideoFrame(videoRef.current, side);
      await finishSide(file);
    } catch {
      setStatus("Fotoğraf alınamadı. Kamerayı sabit tutup yeniden deneyin.");
    } finally {
      captureBusyRef.current = false;
    }
  }, [finishSide, phase, side]);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("error");
        setStatus("Bu sistemde kamera erişimi kullanılamıyor. Dosyadan kimlik görseli seçebilirsiniz.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 }
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

        setPhase("capturing");
        setStatus("Kimliği kameraya gösterin.");
        speak("Kimliği kameraya gösterin.");
      } catch (error) {
        setPhase("error");
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setStatus("Kamera izni verilmedi. Kamerayı kullanmak için sistem iznini etkinleştirin veya dosyadan görsel seçin.");
        } else if (error instanceof DOMException && error.name === "NotFoundError") {
          setStatus("Kullanılabilir bir kamera bulunamadı. Dosyadan kimlik görseli seçebilirsiniz.");
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

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
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
        speak("Sabit tutun.");
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
        ["Kadraj", quality.guideCoverage >= 0.48 && quality.guideDensity >= 0.008]
      ] as const
    : [];

  return <WorkspaceSubflowOverlay
    title="Kimliği kameradan tara"
    className="identity-camera-overlay"
    closeBlocked={phase === "processing"}
    onClose={onClose}
    footer={<div className="identity-camera__footer">
      <span className="identity-camera__shortcut">Space: fotoğraf çek · Esc: iptal</span>
      <div className="action-row">
        <ActionButton variant="secondary" type="button" disabled={phase === "processing"} onClick={onClose}>İptal</ActionButton>
        <ActionButton type="button" disabled={phase !== "capturing"} onClick={() => void captureManual()}>
          <Camera size={16} aria-hidden="true" />Fotoğraf çek
        </ActionButton>
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
          <strong>{phase === "processing" ? "Kimlik okunuyor" : phase === "error" ? "Kamera kullanılamıyor" : "Kamera hazırlanıyor"}</strong>
        </div>}
      </div>

      <div className="identity-camera__status" role={phase === "error" ? "alert" : "status"} aria-live="polite">
        <strong>{side === "front" ? "Kimliğin ön yüzü" : "Kimliğin arka yüzü"}</strong>
        <span>{status}</span>
      </div>

      {phase === "capturing" && <div className="identity-camera__quality" aria-label="Görüntü kalitesi">
        {qualitySummary.map(([label, ready]) => <span className={ready ? "is-ready" : ""} key={label}>
          <i aria-hidden="true" />{label}
        </span>)}
        {candidateCount > 0 && <span className="identity-camera__candidate-count">{candidateCount}/3 iyi kare</span>}
      </div>}

      {captureBackSide && <p className="identity-camera__flow-note">
        Ön yüz otomatik alındıktan sonra kimliği çevirmeniz istenecek. İki yüz de çekilmeden AI analizi başlamaz.
      </p>}

      <canvas ref={analysisCanvasRef} className="identity-camera__analysis-canvas" aria-hidden="true" />
    </div>
  </WorkspaceSubflowOverlay>;
}

async function captureVideoFrame(video: HTMLVideoElement, side: CaptureSide): Promise<File> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("camera_frame_unavailable");
  }

  const maxDimension = 2200;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("camera_canvas_unavailable");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob || blob.size <= 0) throw new Error("camera_blob_unavailable");

  return new File(
    [blob],
    `identity-${side}-${Date.now()}.jpg`,
    { type: "image/jpeg", lastModified: Date.now() }
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    utterance.rate = 0.96;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech feedback is best-effort; camera capture must not depend on it.
  }
}
