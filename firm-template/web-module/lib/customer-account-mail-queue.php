<?php
declare(strict_types=1);

/** Key belongs to protected host configuration, shared by HTTP and CLI, never SQLite. */
function ya_account_mail_encryption_key(): string
{
    $key=base64_decode((string)getenv('YA_ACCOUNT_MAIL_ENCRYPTION_KEY'),true);
    if(!is_string($key) || strlen($key)!==32)throw new RuntimeException('mail_encryption_unconfigured');
    return $key;
}
function ya_account_mail_key_configured(): bool
{
    try{ya_account_mail_encryption_key();return true;}catch(Throwable){return false;}
}
function ya_account_mail_seal(array $value): string
{
    $nonce=random_bytes(12);$tag='';
    $cipher=openssl_encrypt(json_encode($value,JSON_THROW_ON_ERROR),'aes-256-gcm',ya_account_mail_encryption_key(),OPENSSL_RAW_DATA,$nonce,$tag,'ya-account-mail-v1');
    if(!is_string($cipher) || strlen($tag)!==16)throw new RuntimeException('mail_encryption_failed');
    return base64_encode($nonce.$tag.$cipher);
}
/** Null cancels revoked/expired messages before network IO. No plaintext is persisted. */
function ya_account_mail_unseal(PDO $db,array $row): ?string
{
    $sealed=base64_decode($row['body'],true);
    if(!is_string($sealed) || strlen($sealed)<29)throw new RuntimeException('invalid_mail_ciphertext');
    $plaintext=openssl_decrypt(substr($sealed,28),'aes-256-gcm',ya_account_mail_encryption_key(),OPENSSL_RAW_DATA,substr($sealed,0,12),substr($sealed,12,16),'ya-account-mail-v1');
    if(!is_string($plaintext))throw new RuntimeException('mail_decryption_failed');
    $value=json_decode($plaintext,true,512,JSON_THROW_ON_ERROR);
    if(!is_array($value) || !is_string($value['token_hash']??null) || !is_string($value['account_id']??null)
        || !in_array($value['purpose']??'', ['verify','reset'],true) || !is_int($value['session_version']??null) || !is_string($value['body']??null))throw new RuntimeException('invalid_token_mail');
    $query=$db->prepare('SELECT a.email_verified FROM customer_account_tokens t JOIN customer_accounts a ON a.id=t.account_id
        WHERE t.token_hash=? AND t.account_id=? AND t.purpose=? AND t.expires_at>? AND t.consumed_at=0 AND a.session_version=? AND a.email=?');
    $query->execute([$value['token_hash'],$value['account_id'],$value['purpose'],time(),$value['session_version'],$row['recipient']]);
    $account=$query->fetch();
    if(!$account || !ya_account_enabled() || ($value['purpose']==='verify' && (bool)$account['email_verified']) || ($value['purpose']==='reset' && !(bool)$account['email_verified']))return null;
    return $value['body'];
}
