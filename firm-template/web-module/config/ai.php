<?php
declare(strict_types=1);

if (basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === 'chat.php') {
    require_once dirname(__DIR__) . '/lib/public-request-guard.php';
    ya_public_guard_enforce('chat');
}

$enabled = getenv('YARDIMCI_ASISTAN_AI_ENABLED') ?: '';

$config = [
    'enabled' => in_array(strtolower((string) $enabled), ['1', 'true', 'yes', 'on'], true),
    'provider' => getenv('YARDIMCI_ASISTAN_AI_PROVIDER') ?: 'openai_compatible',
    'base_url' => getenv('YARDIMCI_ASISTAN_AI_BASE_URL') ?: 'https://api.openai.com/v1',
    'model' => getenv('YARDIMCI_ASISTAN_AI_MODEL') ?: '',
    'api_key' => getenv('YARDIMCI_ASISTAN_AI_API_KEY') ?: (getenv('OPENAI_API_KEY') ?: ''),
    'timeout_seconds' => (int) (getenv('YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS') ?: 15)
];

$configFiles = [
    __DIR__ . '/ai.local.php',
    dirname(__DIR__) . '/data/ai-settings.local.php'
];

foreach ($configFiles as $configFile) {
    if (!is_file($configFile)) {
        continue;
    }

    // Masaüstü AI ayarlarını hosting çalışırken güncelleyebilir. Bazı PHP/opcache
    // kurulumları aynı process içinde değişen dosyayı revalidate süresi dolana kadar
    // eski bytecode ile çalıştırır. Runtime ayar dosyası küçük ve seyrek değiştiği
    // için her okumada açıkça invalidate etmek yeni ayarı hemen görünür kılar.
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($configFile, true);
    }
    clearstatcache(true, $configFile);

    $localConfig = require $configFile;
    if (is_array($localConfig)) {
        $config = array_merge($config, $localConfig);
    }
}

return $config;