<?php
declare(strict_types=1);
const YA_INSTAGRAM_STAGE_MAX_BYTES = 8388608;
const YA_INSTAGRAM_STAGE_TTL = 1200;
function ya_instagram_stage_directory(): string { return __DIR__ . '/../data/instagram-staging'; }
function ya_instagram_stage_hash(string $token): string {
    if (preg_match('/^[a-f0-9]{64}$/D', $token) !== 1) throw new InvalidArgumentException('Invalid staging capability');
    return hash('sha256', $token);
}
function ya_instagram_stage_prune(int $now): void {
    foreach (glob(ya_instagram_stage_directory() . '/*.jpg') ?: [] as $file) {
        if (preg_match('/^(\d{10})\.[a-f0-9]{64}\.jpg$/D', basename($file), $match) === 1 && (int)$match[1] <= $now) @unlink($file);
    }
}
function ya_instagram_stage_write(string $token, string $bytes, int $expires, int $now): void {
    $hash = ya_instagram_stage_hash($token);
    if ($expires <= $now || $expires > $now + YA_INSTAGRAM_STAGE_TTL || strlen($bytes) < 1 || strlen($bytes) > YA_INSTAGRAM_STAGE_MAX_BYTES) throw new InvalidArgumentException('Invalid staged image');
    $image = @getimagesizefromstring($bytes);
    if ($image === false || $image[2] !== IMAGETYPE_JPEG || $image[0] < 320 || $image[0] > 1440 || $image[0]*$image[1] > 40000000 || $image[0]/$image[1] < 0.8 || $image[0]/$image[1] > 1.91) throw new InvalidArgumentException('Invalid staged image');
    $dir = ya_instagram_stage_directory();
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) throw new RuntimeException('Staging unavailable');
    ya_instagram_stage_prune($now);
    $target = $dir . '/' . $expires . '.' . $hash . '.jpg';
    // Exact upload replay is idempotent, immutable and does not extend expiration.
    $existing = glob($dir . '/*.' . $hash . '.jpg') ?: [];
    if ($existing) {
        if (count($existing) !== 1 || $existing[0] !== $target || !hash_equals(hash('sha256', $bytes), (string)hash_file('sha256', $target))) throw new InvalidArgumentException('Staging conflict');
        return;
    }
    $handle = @fopen($target, 'x+b');
    if (!$handle) throw new RuntimeException('Staging unavailable');
    try { if (fwrite($handle, $bytes) !== strlen($bytes)) { @unlink($target); throw new RuntimeException('Staging unavailable'); } }
    finally { fclose($handle); }
    chmod($target, 0600);
}
function ya_instagram_stage_find(string $token, int $now): ?string {
    $hash = ya_instagram_stage_hash($token);
    $files = glob(ya_instagram_stage_directory() . '/*.' . $hash . '.jpg') ?: [];
    if (count($files) !== 1) return null;
    $file = $files[0];
    if (is_link($file) || preg_match('/^(\d{10})\.[a-f0-9]{64}\.jpg$/D', basename($file), $match) !== 1) return null;
    if ((int)$match[1] <= $now) { @unlink($file); return null; }
    if (filesize($file) < 1 || filesize($file) > YA_INSTAGRAM_STAGE_MAX_BYTES) return null;
    return $file;
}
function ya_instagram_stage_delete(string $token): void {
    $hash = ya_instagram_stage_hash($token);
    foreach (glob(ya_instagram_stage_directory() . '/*.' . $hash . '.jpg') ?: [] as $file) @unlink($file);
}
