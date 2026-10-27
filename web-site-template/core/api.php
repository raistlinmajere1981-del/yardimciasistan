<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }


final class PublicApi
{
    private array $responses = [];
    public function __construct(private readonly string $origin, private readonly string $basePath,
        private readonly ?string $localApiRoot = null, private readonly string $phpCli = '/usr/bin/php') {}

    /** Request-local only. A failed/revoked publication never reuses yesterday's data. */
    public function read(string $endpoint): array
    {
        if (!in_array($endpoint, ['business', 'rooms', 'tables', 'menu', 'catalog', 'marketing', 'google-reviews', 'account/config'], true)) {
            throw new \InvalidArgumentException('Unknown public endpoint');
        }
        if (isset($this->responses[$endpoint])) return $this->responses[$endpoint];
        if ($this->localApiRoot !== null) {
            return $this->responses[$endpoint] = $this->readLocalPublicEndpoint($endpoint);
        }
        $result = ['status' => 'unavailable', 'data' => []];
        $parts = parse_url($this->origin);
        // Never derive the destination from Host, query input or a published URL.
        if (!is_array($parts) || !in_array($parts['scheme'] ?? '', ['http', 'https'], true)
            || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['query']) || isset($parts['fragment']) || !in_array($parts['path'] ?? '', ['', '/'], true)) {
            return $this->responses[$endpoint] = $result;
        }
        $context = stream_context_create(['http' => [
            'method' => 'GET', 'header' => "Accept: application/json\r\nConnection: close\r\n",
            'timeout' => 1.5, 'follow_location' => 0, 'ignore_errors' => true,
        ]]);
        $limit = 8 * 1024 * 1024;
        $raw = @file_get_contents(rtrim($this->origin, '/') . $this->basePath . '/api/' . $endpoint . '.php', false, $context, 0, $limit + 1);
        $status = preg_match('~^HTTP/\S+ (\d{3})\b~', $http_response_header[0] ?? '', $match) ? (int) $match[1] : 0;
        if ($status === 404) $result['status'] = 'empty';
        $payload = is_string($raw) && strlen($raw) <= $limit ? json_decode($raw, true) : null;
        // Reviews intentionally have a different envelope from the other endpoints.
        $valid = is_array($payload) && ($endpoint === 'google-reviews'
            ? is_bool($payload['available'] ?? null) : ($payload['ok'] ?? false) === true);
        if ($status === 200 && $valid) $result = ['status' => 'ok', 'data' => $payload];
        return $this->responses[$endpoint] = $result;
    }

    /**
     * Optional same-host transport for one-worker PHP hosting.
     * Executes the EXISTING read-only public API endpoint in a separate PHP CLI
     * process. No direct database access, copied projection or dynamic script name.
     * Other hosted templates retain the ordinary public HTTP contract.
     */
    private function readLocalPublicEndpoint(string $endpoint): array
    {
        $unavailable = ['status' => 'unavailable', 'data' => []];
        $root = is_string($this->localApiRoot) ? realpath($this->localApiRoot) : false;
        $script = $root !== false ? realpath($root . '/api/' . $endpoint . '.php') : false;
        if ($root === false || $script === false || !str_starts_with($script, $root . '/api/')
            || !is_file($script) || !is_executable($this->phpCli) || !function_exists('proc_open')) {
            return $unavailable;
        }
        $environment = getenv();
        if (!is_array($environment)) $environment = [];
        foreach (array_keys($environment) as $key) {
            if (str_starts_with($key, 'HTTP_') || $key === 'REQUEST_METHOD') unset($environment[$key]);
        }
        $environment['REQUEST_METHOD'] = 'GET';
        // proc_open with an argv array invokes no shell; arguments never come from the request.
        $pipes = [];
        $process = @proc_open([$this->phpCli, $script], [
            0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']
        ], $pipes, $root, $environment);
        if (!is_resource($process)) return $unavailable;
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], 3);
        $raw = stream_get_contents($pipes[1], 8 * 1024 * 1024 + 1);
        $timedOut = stream_get_meta_data($pipes[1])['timed_out'] ?? true;
        fclose($pipes[1]);
        if ($timedOut) @proc_terminate($process);
        // Do not reflect diagnostics or server paths to public page responses.
        stream_set_blocking($pipes[2], false);
        fclose($pipes[2]);
        $exit = proc_close($process);
        if ($timedOut || $exit !== 0 || !is_string($raw) || strlen($raw) > 8 * 1024 * 1024) return $unavailable;
        $payload = json_decode($raw, true);
        $valid = is_array($payload) && ($endpoint === 'google-reviews'
            ? is_bool($payload['available'] ?? null) : ($payload['ok'] ?? false) === true);
        return $valid ? ['status' => 'ok', 'data' => $payload] : $unavailable;
    }
}

function public_sources(PublicApi $api, array $business): array
{
    if (($business['ok'] ?? false) !== true || !is_array($business['business'] ?? null)) return [];
    $sources = ['marketing' => $api->read('marketing'), 'account/config' => $api->read('account/config')];
    $surfaces = is_array($business['business']['public_surfaces'] ?? null) ? $business['business']['public_surfaces'] : [];
    if (in_array('rooms', $surfaces, true) || in_array('accommodation', $surfaces, true)) $sources['rooms'] = $api->read('rooms');
    if (in_array('restaurant', $surfaces, true) || in_array('tables', $surfaces, true) || in_array('food_service', $surfaces, true)) $sources['tables'] = $api->read('tables');
    if (in_array('menu', $surfaces, true) || in_array('qr_menu', $surfaces, true)) $sources['menu'] = $api->read('menu');
    if (in_array('store', $surfaces, true) || in_array('catalog', $surfaces, true) || in_array('online_sales', $surfaces, true)) $sources['catalog'] = $api->read('catalog');
    if (($business['business']['google_reviews_enabled'] ?? false) === true) $sources['google-reviews'] = $api->read('google-reviews');
    return $sources;
}
