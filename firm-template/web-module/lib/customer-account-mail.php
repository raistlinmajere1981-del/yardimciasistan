<?php
declare(strict_types=1);

/** Explicit TLS SMTP transport. No token return, file mailbox or PHP mail fallback in production. */
function ya_account_mail_configured(): bool
{
    return (bool)getenv('YA_ACCOUNT_SMTP_HOST') && (bool)getenv('YA_ACCOUNT_SMTP_USER')
        && (bool)getenv('YA_ACCOUNT_SMTP_PASSWORD') && filter_var(getenv('YA_ACCOUNT_MAIL_FROM'), FILTER_VALIDATE_EMAIL)
        && (bool)getenv('YA_ACCOUNT_SITE_URL');
}
function ya_account_mail(string $email, string $purpose, string $token): void
{
    if (!ya_account_mail_configured()) throw new YaAccountError(503, 'mail_unconfigured');
    $site = ya_account_site_url();
    $link = $site . '?action=' . ($purpose === 'verify' ? 'verify' : 'reset') . '#token=' . rawurlencode($token);
    $subject = $purpose === 'verify' ? 'Verify your email / E-posta doğrulama' : 'Reset your password / Şifre yenileme';
    $body = "Hesabınız için aşağıdaki bağlantıyı açın. / Open the link for your account.\r\n\r\n" . $link . "\r\n\r\nBu işlemi siz istemediyseniz yok sayın. / Ignore if you did not request this.\r\n";
    ya_mail_send($email, $subject, $body);
}

/** Single TLS transport for account messages and durable commerce mail. */
function ya_mail_send(string $email, string $subject, string $body, string $messageId = ''): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) throw new RuntimeException('invalid_mail_recipient');
    if ($messageId !== '' && preg_match('/^<[a-f0-9]{64}@yardimci.invalid>$/D', $messageId) !== 1) throw new RuntimeException('invalid_message_id');
    $host = (string)getenv('YA_ACCOUNT_SMTP_HOST');
    $implicit = getenv('YA_ACCOUNT_SMTP_TLS') === 'implicit';
    $port = (int)(getenv('YA_ACCOUNT_SMTP_PORT') ?: ($implicit ? 465 : 587));
    if (!preg_match('/^[a-zA-Z0-9.-]+$/D', $host) || $port < 1 || $port > 65535) throw new YaAccountError(503, 'mail_unconfigured');
    $from = (string)getenv('YA_ACCOUNT_MAIL_FROM');
    if (!filter_var($from, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $from)) throw new YaAccountError(503, 'mail_unconfigured');
    $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host]]);
    $socket = @stream_socket_client(($implicit ? 'tls://' : 'tcp://') . $host . ':' . $port, $errno, $error, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) throw new YaAccountError(503, 'mail_unavailable');
    stream_set_timeout($socket, 15);
    $read = static function (array $allowed) use ($socket): void {
        $line = ''; $size = 0;
        do {
            $line = fgets($socket, 2048); $size += strlen($line ?: '');
            if ($line === false || $size > 16384) throw new YaAccountError(503, 'mail_unavailable');
        } while (isset($line[3]) && $line[3] === '-');
        if (!in_array((int)substr($line, 0, 3), $allowed, true)) throw new YaAccountError(503, 'mail_unavailable');
    };
    $command = static function (string $line, array $allowed) use ($socket, $read): void {
        $bytes = $line . "\r\n"; $offset = 0;
        while ($offset < strlen($bytes)) {
            $written = fwrite($socket, substr($bytes, $offset));
            if ($written === false || $written === 0) throw new YaAccountError(503, 'mail_unavailable');
            $offset += $written;
        }
        $read($allowed);
    };
    try {
        $read([220]); $command('EHLO account.local', [250]);
        if (!$implicit) {
            $command('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new YaAccountError(503, 'mail_unavailable');
            $command('EHLO account.local', [250]);
        }
        $command('AUTH LOGIN', [334]); $command(base64_encode((string)getenv('YA_ACCOUNT_SMTP_USER')), [334]);
        $command(base64_encode((string)getenv('YA_ACCOUNT_SMTP_PASSWORD')), [235]);
        $command('MAIL FROM:<' . $from . '>', [250]); $command('RCPT TO:<' . $email . '>', [250, 251]);
        $command('DATA', [354]);
        $message = ($messageId !== '' ? 'Message-ID: ' . $messageId . "\r\n" : '') . 'Date: ' . date(DATE_RFC2822) . "\r\nFrom: <" . $from . ">\r\nTo: <" . $email . ">\r\nSubject: =?UTF-8?B?" . base64_encode($subject)
            . "?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
        $command($message . '.', [250]);
    } finally { fclose($socket); }
}
