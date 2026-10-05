<?php
declare(strict_types=1);
// Apache piped ErrorLog filter. Install outside DocumentRoot; never stores raw input.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$target = $argv[1] ?? '';
if (preg_match('~^(?:/|[A-Za-z]:[\\\\/])~', $target) !== 1) { fwrite(STDERR, "Absolute log target required\n"); exit(2); }
umask(0077); // New logs are private; existing log permissions are preserved.
$output = @fopen($target, 'ab');
if ($output === false) { fwrite(STDERR, "Log target unavailable\n"); exit(1); }
while (($line = fgets(STDIN)) !== false) {
    $safe = preg_replace_callback('~(?:https?(?::|%253a|%3a)(?:[\\\\/]|%252f|%2f){2,}|/|%252f|%2f)[^\s"\'<>]+~i', static function (array $match): string {
        $decoded = str_replace('\\/', '/', $match[0]);
        for ($i = 0; $i < 2; $i++) $decoded = rawurldecode($decoded);
        return preg_match('~/(?:instagram-media[.]php|(?:data/)?instagram-staging)~i', $decoded) === 1 ? '[instagram-staging:redacted]' : $match[0];
    }, $line);
    if ($safe === null) $safe = "[hosting log redaction failed]\n";
    if (fwrite($output, $safe) !== strlen($safe)) { fwrite(STDERR, "Log write failed\n"); exit(1); }
    fflush($output);
}
fclose($output);
