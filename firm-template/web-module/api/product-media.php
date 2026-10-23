<?php
declare(strict_types=1);

// Immutable public product pictures only. Dealer/customer documents never use this route.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function ya_product_media_response(int $status, string $message, array $extra = []): never
{
    http_response_code($status);
    echo json_encode(['ok' => $status === 200, 'message' => $message] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    ya_product_media_response(405, 'Ürün fotoğrafı için POST isteği gerekli.');
}
$json = @file_get_contents(__DIR__ . '/../config/business.json');
$config = is_string($json) ? json_decode($json, true) : null;
$secret = is_array($config) ? trim((string)($config['sync_secret'] ?? '')) : '';
$provided = trim((string)($_SERVER['HTTP_X_YA_SYNC_SECRET'] ?? ''));
if ($secret === '' || $provided === '' || !hash_equals($secret, $provided)) ya_product_media_response(401, 'Güncelleme izni alınamadı.');
$product = $_POST['product_id'] ?? null;
$hash = $_POST['content_hash'] ?? null;
$client = $_POST['client_id'] ?? null;
if (!is_string($product) || preg_match('/^[A-Za-z0-9_-]{1,180}$/D', $product) !== 1
    || !is_string($hash) || preg_match('/^[a-f0-9]{64}$/D', $hash) !== 1
    || ($_POST['media_id'] ?? null) !== $hash || ($_POST['kind'] ?? null) !== 'photo'
    || !is_string($client) || preg_match('/^[A-Za-z0-9._:-]{1,180}$/D', $client) !== 1) ya_product_media_response(422, 'Ürün fotoğrafı bilgileri geçersiz.');
$file = $_FILES['file'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) ya_product_media_response(422, 'Fotoğraf yüklenemedi.');
$temporary = (string)($file['tmp_name'] ?? '');
$size = (int)($file['size'] ?? 0);
if (!is_uploaded_file($temporary) || $size < 1 || $size > 30 * 1024 * 1024) ya_product_media_response(422, 'Fotoğraf en fazla 30 MB olabilir.');
$mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporary);
$extension = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$mime] ?? '';
$bounds = @getimagesize($temporary);
if ($extension === '' || !$bounds || $bounds[0] < 1 || $bounds[1] < 1 || (float)$bounds[0] * $bounds[1] > 100000000
    || ($bounds['mime'] ?? '') !== $mime || !hash_equals($hash, (string)hash_file('sha256', $temporary))) ya_product_media_response(422, 'Fotoğrafın içeriği doğrulanamadı.');
$directory = __DIR__ . '/../media/products/' . $product;
if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) ya_product_media_response(500, 'Fotoğraf alanı hazırlanamadı.');
$destination = $directory . '/' . $hash . '.' . $extension;
if (!is_file($destination) || !hash_equals($hash, (string)hash_file('sha256', $destination))) {
    $staged = $directory . '/.' . bin2hex(random_bytes(16)) . '.upload';
    if (!move_uploaded_file($temporary, $staged)) ya_product_media_response(500, 'Fotoğraf kaydedilemedi.');
    @chmod($staged, 0644);
    if (!rename($staged, $destination)) { @unlink($staged); ya_product_media_response(500, 'Fotoğraf kaydedilemedi.'); }
}
$base = rtrim(dirname(dirname(str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/api/product-media.php')))), '/');
ya_product_media_response(200, 'Ürün fotoğrafı yüklendi.', ['url' => $base . '/media/products/' . rawurlencode($product) . '/' . $hash . '.' . $extension,
    'content_hash' => $hash, 'mime_type' => $mime, 'bytes' => $size]);
