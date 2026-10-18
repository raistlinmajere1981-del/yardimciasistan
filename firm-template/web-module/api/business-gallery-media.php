<?php
declare(strict_types=1);

const YA_GALLERY_MEDIA_BASE_DIR = __DIR__ . '/..';
const YA_GALLERY_MEDIA_CONFIG_FILE = YA_GALLERY_MEDIA_BASE_DIR . '/config/business.json';
const YA_GALLERY_MEDIA_ROOT = YA_GALLERY_MEDIA_BASE_DIR . '/media/gallery';
const YA_GALLERY_MEDIA_IMAGE_MAX_BYTES = 31457280;
const YA_GALLERY_MEDIA_VIDEO_MAX_BYTES = 209715200;

$businessConfig = ya_gallery_media_load_json(YA_GALLERY_MEDIA_CONFIG_FILE, []);
ya_gallery_media_apply_cors($businessConfig);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    ya_gallery_media_response(405, ['ok' => false, 'message' => 'Galeri medyası için POST isteği gerekli.']);
}
if (!ya_gallery_media_authorized($businessConfig)) {
    ya_gallery_media_response(401, ['ok' => false, 'message' => 'Güncelleme izni alınamadı. Güvenlik anahtarını kontrol edin.']);
}

$galleryId = ya_gallery_media_id($_POST['gallery_id'] ?? '');
$mediaId = ya_gallery_media_id($_POST['media_id'] ?? '');
$clientId = ya_gallery_media_id($_POST['client_id'] ?? '');
$kind = trim((string) ($_POST['kind'] ?? ''));
$contentHash = strtolower(trim((string) ($_POST['content_hash'] ?? '')));

if ($galleryId !== 'gallery' || $mediaId === '' || $clientId === '') {
    ya_gallery_media_response(422, ['ok' => false, 'message' => 'Galeri, medya veya istemci kimliği geçersiz.']);
}
if (!in_array($kind, ['cover', 'photo'], true)) {
    ya_gallery_media_response(422, ['ok' => false, 'message' => 'Medya türü geçersiz.']);
}
if ($contentHash !== '' && preg_match('/^[a-f0-9]{64}$/', $contentHash) !== 1) {
    ya_gallery_media_response(422, ['ok' => false, 'message' => 'Medya özeti geçersiz.']);
}

$file = $_FILES['file'] ?? null;
if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    ya_gallery_media_response(422, ['ok' => false, 'message' => 'Yüklenecek medya dosyası bulunamadı.']);
}

$temporaryPath = (string) ($file['tmp_name'] ?? '');
$size = (int) ($file['size'] ?? 0);
if ($temporaryPath === '' || !is_uploaded_file($temporaryPath) || $size <= 0) {
    ya_gallery_media_response(422, ['ok' => false, 'message' => 'Geçici medya yüklemesi geçersiz.']);
}

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = strtolower((string) $finfo->file($temporaryPath));
$imageTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp'
];
$videoTypes = [
    'video/mp4' => 'mp4',
    'video/webm' => 'webm'
];

if ($kind === 'video') {
    if (!isset($videoTypes[$mime]) || $size > YA_GALLERY_MEDIA_VIDEO_MAX_BYTES) {
        ya_gallery_media_response(422, ['ok' => false, 'message' => 'Video MP4/WebM olmalı ve 200 MB sınırını aşmamalı.']);
    }
    $extension = $videoTypes[$mime];
} else {
    if (!isset($imageTypes[$mime]) || $size > YA_GALLERY_MEDIA_IMAGE_MAX_BYTES) {
        ya_gallery_media_response(422, ['ok' => false, 'message' => 'Görsel JPG/PNG/WebP olmalı ve 30 MB sınırını aşmamalı.']);
    }
    $extension = $imageTypes[$mime];
}

if ($contentHash !== '') {
    $actualHash = hash_file('sha256', $temporaryPath);
    if (!is_string($actualHash) || !hash_equals($contentHash, strtolower($actualHash))) {
        ya_gallery_media_response(422, ['ok' => false, 'message' => 'Medya dosyası aktarım sırasında doğrulanamadı.']);
    }
}

$galleryDirectory = YA_GALLERY_MEDIA_ROOT . '/' . $galleryId;
if (!is_dir($galleryDirectory) && !mkdir($galleryDirectory, 0775, true) && !is_dir($galleryDirectory)) {
    ya_gallery_media_response(500, ['ok' => false, 'message' => 'Galeri medya klasörü oluşturulamadı.']);
}

$destination = $galleryDirectory . '/' . $mediaId . '.' . $extension;
foreach (glob($galleryDirectory . '/' . $mediaId . '.*') ?: [] as $oldFile) {
    if (is_file($oldFile) && $oldFile !== $destination) {
        @unlink($oldFile);
    }
}

if (!move_uploaded_file($temporaryPath, $destination)) {
    ya_gallery_media_response(500, ['ok' => false, 'message' => 'Galeri medyası kalıcı alana taşınamadı.']);
}
@chmod($destination, 0644);

$scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/yardimci-asistan/api/gallery-media.php'));
$basePath = rtrim(dirname(dirname($scriptName)), '/');
$relativeUrl = $basePath . '/media/gallery/' . rawurlencode($galleryId) . '/' . rawurlencode(basename($destination));

ya_gallery_media_response(200, [
    'ok' => true,
    'message' => 'Galeri medyası yüklendi.',
    'url' => $relativeUrl,
    'mime_type' => $mime,
    'bytes' => $size
]);

function ya_gallery_media_id(mixed $value): string
{
    $id = trim((string) $value);
    return preg_match('/^[A-Za-z0-9._:-]{1,180}$/', $id) === 1 ? $id : '';
}

function ya_gallery_media_authorized(array $businessConfig): bool
{
    $configured = trim((string) ($businessConfig['sync_secret'] ?? ''));
    $provided = trim((string) ($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? ''));
    return $configured !== '' && $provided !== '' && hash_equals($configured, $provided);
}

function ya_gallery_media_apply_cors(array $businessConfig): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowed = $businessConfig['allowed_origins'] ?? [];
    if ($origin !== '' && is_array($allowed) && (in_array('*', $allowed, true) || in_array($origin, $allowed, true))) {
        header('Access-Control-Allow-Origin: ' . (in_array('*', $allowed, true) ? '*' : $origin));
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-YA-Sync-Secret');
}

function ya_gallery_media_load_json(string $path, mixed $fallback): mixed
{
    if (!is_file($path)) return $fallback;
    $json = file_get_contents($path);
    $decoded = json_decode(is_string($json) ? $json : '', true);
    return is_array($decoded) ? $decoded : $fallback;
}

function ya_gallery_media_response(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
