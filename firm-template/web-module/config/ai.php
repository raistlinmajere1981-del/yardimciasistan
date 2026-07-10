<?php
declare(strict_types=1);

$enabled = getenv('YARDIMCI_ASISTAN_AI_ENABLED') ?: '';

$config = [
    'enabled' => in_array(strtolower((string) $enabled), ['1', 'true', 'yes', 'on'], true),
    'provider' => getenv('YARDIMCI_ASISTAN_AI_PROVIDER') ?: 'openai_compatible',
    'base_url' => getenv('YARDIMCI_ASISTAN_AI_BASE_URL') ?: 'https://api.openai.com/v1',
    'model' => getenv('YARDIMCI_ASISTAN_AI_MODEL') ?: '',
    'api_key' => getenv('YARDIMCI_ASISTAN_AI_API_KEY') ?: (getenv('OPENAI_API_KEY') ?: ''),
    'timeout_seconds' => (int) (getenv('YARDIMCI_ASISTAN_AI_TIMEOUT_SECONDS') ?: 15)
];

$localConfigFile = __DIR__ . '/ai.local.php';
if (is_file($localConfigFile)) {
    $localConfig = require $localConfigFile;
    if (is_array($localConfig)) {
        return array_merge($config, $localConfig);
    }
}

return $config;
