<?php
declare(strict_types=1);
require_once __DIR__ . '/../firm-template/web-module/lib/business-messaging.php';
function check(bool $condition, string $label): void { if (!$condition) throw new RuntimeException($label); }
check(ya_messaging_verify_challenge(['hub.mode'=>'subscribe','hub.verify_token'=>'verify-private','hub.challenge'=>'12345'], 'verify-private') === '12345', 'challenge');
check(ya_messaging_verify_challenge(['hub_mode'=>'subscribe','hub_verify_token'=>'verify-private','hub_challenge'=>'12345'], 'verify-private') === '12345', 'PHP GET challenge');
check(ya_messaging_verify_challenge(['hub.mode'=>'subscribe','hub.verify_token'=>'wrong','hub.challenge'=>'12345'], 'verify-private') === null, 'invalid verification');
check(ya_messaging_verify_challenge([], '') === null, 'unconfigured');
check(ya_messaging_verify_challenge(['hub.mode'=>'subscribe','hub.verify_token'=>'verify-private','hub.challenge'=>'opaque-challenge'], 'verify-private') === 'opaque-challenge', 'opaque challenge');
$time = (string)time();
$payload = ['object'=>'whatsapp_business_account','entry'=>[['id'=>'1001','changes'=>[['field'=>'messages','value'=>['metadata'=>['phone_number_id'=>'2002'],
    'messages'=>[['text'=>['body'=>'INBOUND_PRIVATE']]], 'statuses'=>array_map(static fn($state)=>['id'=>'wamid.fixture','status'=>$state,'timestamp'=>$time,
      'recipient_id'=>'905550000000','errors'=>[['code'=>131026,'message'=>'CUSTOMER_PRIVATE']]], ['sent','delivered','read','failed'])]]]]]];
$body = json_encode($payload, JSON_THROW_ON_ERROR); $signature = 'sha256=' . hash_hmac('sha256', $body, 'app-private');
check(ya_messaging_valid_signature($body, $signature, 'app-private'), 'valid signature');
check(!ya_messaging_valid_signature($body.' ', $signature, 'app-private'), 'tampered signature');
check(!ya_messaging_valid_signature($body, $signature, ''), 'missing secret');
$statuses = ya_messaging_statuses($body); check(count($statuses) === 4, 'status count');
check(array_column($statuses, 'status') === ['accepted','delivered','read','failed'], 'mapping');
$json = json_encode($statuses, JSON_THROW_ON_ERROR);
foreach (['INBOUND_PRIVATE','905550000000','CUSTOMER_PRIVATE','app-private'] as $secret) check(!str_contains($json,$secret), 'PII stripped');
$database = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$database->exec('CREATE TABLE business_messaging_status_queue(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL UNIQUE,account_key TEXT NOT NULL,payload_json TEXT NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)');
ya_messaging_enqueue($database, $statuses); ya_messaging_enqueue($database, $statuses);
check((int)$database->query('SELECT COUNT(*) FROM business_messaging_status_queue')->fetchColumn() === 4, 'duplicate ignored');
$key = hash('sha256','1001:2002'); $pulled = ya_messaging_pull($database,$key); check(count($pulled) === 4, 'pull');
check(ya_messaging_pull($database,hash('sha256','other')) === [], 'account isolation');
ya_messaging_ack($database, $key, array_column($pulled,'seq')); ya_messaging_enqueue($database, $statuses);
check(ya_messaging_pull($database,$key) === [], 'ack and durable duplicate receipt');
check((int)$database->query('SELECT COUNT(*) FROM business_messaging_status_queue')->fetchColumn() === 4, 'receipt retained');
check($database->query('SELECT payload_json FROM business_messaging_status_queue LIMIT 1')->fetchColumn() === '{}', 'ack removes payload');
try { ya_messaging_statuses('{broken'); throw new RuntimeException('malformed accepted'); } catch (JsonException $error) {}
echo "Business messaging webhook verification, signatures, mapping, private queue and replay smoke passed.\n";
