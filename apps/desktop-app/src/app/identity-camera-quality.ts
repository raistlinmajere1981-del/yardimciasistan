export interface IdentityFrameQuality {
  sharpness: number;
  motion: number;
  brightness: number;
  clipping: number;
  guideCoverage: number;
  guideDensity: number;
  score: number;
  acceptable: boolean;
  hint: string;
  luma: Uint8Array;
}

export const IDENTITY_CAMERA_ANALYSIS_WIDTH = 400;
export const IDENTITY_CAMERA_ANALYSIS_HEIGHT = 225;
export const IDENTITY_CAMERA_GUIDE_WIDTH_RATIO = 0.88;
export const IDENTITY_CAMERA_GUIDE_HEIGHT_RATIO = 0.84;
export const IDENTITY_CAMERA_GUIDE_COVERAGE_MIN = 0.44;
export const IDENTITY_CAMERA_GUIDE_DENSITY_MIN = 0.007;

const ID_CARD_ASPECT = 85.6 / 53.98;
const IDENTITY_CAMERA_SHARPNESS_MIN = 80;
const IDENTITY_CAMERA_MOTION_MAX = 0.04;

export function evaluateIdentityFrame(
  imageData: ImageData,
  previousLuma?: Uint8Array | null
): IdentityFrameQuality {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const luma = new Uint8Array(pixelCount);

  let brightnessSum = 0;
  let clippedPixels = 0;
  for (let index = 0, pixel = 0; pixel < pixelCount; pixel += 1, index += 4) {
    const value = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
    luma[pixel] = value;
    brightnessSum += value;
    if (value <= 18 || value >= 242) clippedPixels += 1;
  }

  const brightness = pixelCount > 0 ? brightnessSum / pixelCount : 0;
  const clipping = pixelCount > 0 ? clippedPixels / pixelCount : 1;

  const hasMotionBaseline = Boolean(previousLuma && previousLuma.length === luma.length);
  let motion = 1;
  if (hasMotionBaseline && previousLuma) {
    let delta = 0;
    for (let index = 0; index < luma.length; index += 2) {
      delta += Math.abs(luma[index] - previousLuma[index]);
    }
    motion = delta / Math.ceil(luma.length / 2) / 255;
  }

  let laplacianSum = 0;
  let laplacianSquaredSum = 0;
  let laplacianSamples = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const laplacian =
        4 * luma[index]
        - luma[index - 1]
        - luma[index + 1]
        - luma[index - width]
        - luma[index + width];
      laplacianSum += laplacian;
      laplacianSquaredSum += laplacian * laplacian;
      laplacianSamples += 1;
    }
  }
  const laplacianMean = laplacianSamples > 0 ? laplacianSum / laplacianSamples : 0;
  const sharpness = laplacianSamples > 0
    ? Math.max(0, laplacianSquaredSum / laplacianSamples - laplacianMean * laplacianMean)
    : 0;

  const maxGuideWidth = Math.floor(width * IDENTITY_CAMERA_GUIDE_WIDTH_RATIO);
  const maxGuideHeight = Math.floor(height * IDENTITY_CAMERA_GUIDE_HEIGHT_RATIO);
  let guideWidth = maxGuideWidth;
  let guideHeight = Math.floor(guideWidth / ID_CARD_ASPECT);
  if (guideHeight > maxGuideHeight) {
    guideHeight = maxGuideHeight;
    guideWidth = Math.floor(guideHeight * ID_CARD_ASPECT);
  }
  const guideLeft = Math.floor((width - guideWidth) / 2);
  const guideTop = Math.floor((height - guideHeight) / 2);
  const guideRight = guideLeft + guideWidth;
  const guideBottom = guideTop + guideHeight;

  let totalGradient = 0;
  let guideGradient = 0;
  let guideGradientPixels = 0;
  for (let y = 0; y < height - 1; y += 2) {
    for (let x = 0; x < width - 1; x += 2) {
      const index = y * width + x;
      const gradient = Math.abs(luma[index] - luma[index + 1])
        + Math.abs(luma[index] - luma[index + width]);
      totalGradient += gradient;
      if (x >= guideLeft && x < guideRight && y >= guideTop && y < guideBottom) {
        guideGradient += gradient;
        guideGradientPixels += 1;
      }
    }
  }

  const guideCoverage = totalGradient > 0 ? guideGradient / totalGradient : 0;
  const guideDensity = guideGradientPixels > 0 ? guideGradient / guideGradientPixels / 510 : 0;

  const exposureScore = Math.max(0, 1 - Math.abs(brightness - 135) / 125);
  const clippingScore = Math.max(0, 1 - clipping / 0.45);
  const motionScore = hasMotionBaseline ? Math.max(0, 1 - motion / 0.075) : 0;
  const sharpnessScore = Math.min(1, sharpness / 650);
  const guideScore =
    Math.min(1, guideCoverage / 0.68)
    * Math.min(1, guideDensity / 0.032);
  const score = (
    exposureScore * 0.18
    + clippingScore * 0.12
    + motionScore * 0.24
    + sharpnessScore * 0.28
    + guideScore * 0.18
  );

  const exposureOk = brightness >= 48 && brightness <= 220 && clipping <= 0.4;
  const motionOk = hasMotionBaseline && motion <= IDENTITY_CAMERA_MOTION_MAX;
  const sharpnessOk = sharpness >= IDENTITY_CAMERA_SHARPNESS_MIN;
  const guideOk =
    guideCoverage >= IDENTITY_CAMERA_GUIDE_COVERAGE_MIN
    && guideDensity >= IDENTITY_CAMERA_GUIDE_DENSITY_MIN;
  const acceptable = exposureOk && motionOk && sharpnessOk && guideOk;

  let hint = "Kimliği kameraya gösterin.";
  if (hasMotionBaseline && motion > IDENTITY_CAMERA_MOTION_MAX) {
    hint = "Sabit tutun.";
  } else if (brightness < 48) {
    hint = "Ortam çok karanlık. Kimliği biraz daha aydınlatın.";
  } else if (brightness > 220 || clipping > 0.4) {
    hint = "Işık çok güçlü. Parlamayı azaltın.";
  } else if (sharpness < IDENTITY_CAMERA_SHARPNESS_MIN) {
    hint = "Kimliği biraz yaklaştırın ve kamerayı sabit tutun.";
  } else if (!guideOk) {
    hint = "Kimliği çerçevenin içine yerleştirin.";
  } else if (acceptable) {
    hint = "Sabit tutun, otomatik çekim hazırlanıyor.";
  }

  return {
    sharpness,
    motion,
    brightness,
    clipping,
    guideCoverage,
    guideDensity,
    score,
    acceptable,
    hint,
    luma
  };
}
