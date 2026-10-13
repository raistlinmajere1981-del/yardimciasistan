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
    'service' => getenv('YARDIMCI_ASISTAN_AI_SERVICE') ?: 'openai',
    'base_url' => getenv('YARDIMCI_ASISTAN_AI_BASE_URL') ?: 'https://api.openai.com/v1',
    'model' => getenv('YARDIMCI_ASISTAN_AI_MODEL') ?: '',
    // Disabled unless explicitly selected; no fallback to a chat model.
    'stt_model' => '',
    'api_key' => getenv('YARDIMCI_ASISTAN_AI_API_KEY') ?: (getenv('OPENAI_API_KEY') ?: ''),
    'timeout_seconds' => (int) (getenv('YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS') ?: 15)
];

$configFiles = [
    __DIR__ . '/ai.local.php'
];

foreach ($configFiles as $configFile) {
    if (!is_file($configFile)) {
        continue;
    }

    // Host-local defaults can change while PHP/opcache remains running.
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($configFile, true);
    }
    clearstatcache(true, $configFile);

    $localConfig = require $configFile;
    if (is_array($localConfig)) {
        $config = array_merge($config, $localConfig);
    }
}

require_once dirname(__DIR__) . '/lib/storage.php';
$publishedConfig = ya_storage_private_config('ai_settings');
return $publishedConfig === null ? $config : array_merge($config, $publishedConfig);
