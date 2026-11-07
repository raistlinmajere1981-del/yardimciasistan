<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/customer-account.php';
require_once __DIR__ . '/commerce-mail.php';

/** Derived bearer for a guest order; never stored in a publication or URL. */
function ya_commerce_guest_order_token(string $id): string
{
    return ya_storage_web_order_submission_fingerprint(['guest_order_access' => $id]);
}

function ya_commerce_find_order(PDO $db, string $id): ?array
{
    $query=$db->prepare("SELECT payload_json FROM web_orders WHERE id=? AND json_extract(payload_json,'$.event') IS NULL");$query->execute([$id]);
    $raw=$query->fetchColumn();return is_string($raw)?json_decode($raw,true,512,JSON_THROW_ON_ERROR):null;
}

function ya_commerce_require_order_owner(PDO $db, array $input): array
{
    $id=$input['orderId']??'';
    if(!is_string($id) || strlen($id)>180)throw new YaAccountError(404,'order_not_found');
    $order=ya_commerce_find_order($db,$id);
    if(!$order)throw new YaAccountError(404,'order_not_found');
    if(($order['kind']??'guest')==='guest') {
        $token=$input['orderAccessToken']??'';
        if(!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D',$token) || !hash_equals(ya_commerce_guest_order_token($id),$token))throw new YaAccountError(404,'order_not_found');
    } else {
        $account=ya_account_require_session();
        if($order['kind']==='customer')$owns=hash_equals($order['accountId'],$account['id']);
        else {
            $find=$db->prepare('SELECT account_id FROM dealer_access WHERE access_id=?');$find->execute([$order['dealerAccessId']]);
            $owns=hash_equals((string)$find->fetchColumn(),$account['id']);
        }
        if(!$owns)throw new YaAccountError(404,'order_not_found');
    }
    return $order;
}

function ya_commerce_order_state(array $order): array
{
    $id=$order['id'];$snapshot=$order['checkout']??null;
    $result=['order_id'=>$id,'order_number'=>$snapshot['order_number']??$id,'status'=>'placed','payment_status'=>'unpaid','delivery_status'=>'unfulfilled',
        'checkout'=>$snapshot,'created_at'=>$order['createdAt'],'updated_at'=>$order['createdAt'],'events'=>[]];
    $publication=ya_storage_get_publication('dealer_access_private',[]);
    foreach($publication['web_order_statuses']??[] as $state)if($state['order_id']===$id){$result=[...$result,...$state];break;}
    foreach($publication['order_history']??[] as $history)foreach($history['orders']??[] as $canonical)if(($canonical['order_id']??'')===$id && ($canonical['status']??'')==='rejected'){$result['status']='rejected';$result['delivery_status']='cancelled';}
    $find=ya_storage_open()->prepare("SELECT id,created_at FROM web_orders WHERE json_extract(payload_json,'$.event.orderId')=? AND json_extract(payload_json,'$.event.type')='payment_reported' ORDER BY seq");$find->execute([$id]);
    $known=array_column($result['events'],'id');
    foreach($find as $notice)if(!in_array($notice['id'],$known,true)) {
        $result['events'][]=['id'=>$notice['id'],'type'=>'payment_reported','created_at'=>$notice['created_at']];
        if(!in_array($result['status'],['cancelled','rejected'],true) && in_array($result['payment_status'],['unpaid','rejected'],true))$result['payment_status']='verification_pending';
    }
    return $result;
}

function ya_commerce_report_payment(PDO $db, array $order): array
{
    if(!isset($order['checkout']))throw new YaAccountError(409,'payment_instructions_unavailable');
    $state=ya_commerce_order_state($order);
    if(in_array($state['status'],['cancelled','rejected'],true) || in_array($state['payment_status'],['paid','refunded'],true))throw new YaAccountError(409,'payment_notice_unavailable');
    $round='';
    foreach($state['events'] as $event)if($event['type']==='payment_reject')$round=$event['id'];
    $id='payment_notice_'.hash('sha256',$order['id'].($round!==''?':'.$round:''));$now=date(DATE_ATOM);
    $payload=['id'=>$id,'kind'=>'guest','items'=>[],'buyer'=>['name'=>'','phone'=>''],'delivery'=>['method'=>'pickup','address'=>null],
        'event'=>['type'=>'payment_reported','orderId'=>$order['id']],'createdAt'=>$now];
    $insert=$db->prepare('INSERT INTO web_orders(id,payload_json,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING');$insert->execute([$id,ya_storage_encode($payload),$now]);
    if($insert->rowCount()) {
        ya_storage_bump_revision($db,'server_revision');
        ya_commerce_mail_event($db,$order,$id,'payment_reported');
    }
    return ya_commerce_order_state($order);
}

function ya_commerce_status_projection(mixed $rows): array
{
    if(!is_array($rows) || !array_is_list($rows) || count($rows)>100000)throw new InvalidArgumentException('invalid_order_status_projection');
    $result=[];$seen=[];
    foreach($rows as $row) {
        if(!is_array($row) || !is_string($row['order_id']??null) || !preg_match('/^(web_order_|web_dealer_order_)[a-f0-9]{32}$/D',$row['order_id']) || isset($seen[$row['order_id']])
            || !is_string($row['order_number']??null) || !preg_match('/^YA-\d{8}-[A-F0-9]{10}$/D',$row['order_number'])
            || !in_array($row['status']??'', ['placed','confirmed','fulfilled','cancelled'],true)
            || !in_array($row['payment_status']??'', ['unpaid','verification_pending','paid','rejected','refunded'],true)
            || !in_array($row['delivery_status']??'', ['unfulfilled','preparing','delivered','cancelled','returned'],true)
            || !is_string($row['updated_at']??null) || strlen($row['updated_at'])>64 || strtotime($row['updated_at'])===false
            || !is_array($row['events']??null) || !array_is_list($row['events']) || count($row['events'])>1000)throw new InvalidArgumentException('invalid_order_status_projection');
        $events=[];$ids=[];
        foreach($row['events'] as $event) {
            if(!is_array($event) || !is_string($event['id']??null) || !preg_match('/^[A-Za-z0-9:_-]{1,180}$/D',$event['id']) || isset($ids[$event['id']])
                || !in_array($event['type']??'', ['payment_reported','payment_approve','payment_reject','payment_refund','payment_prepare','order_confirmed','order_cancelled','order_delivered','order_refunded'],true)
                || !is_string($event['created_at']??null) || strlen($event['created_at'])>64 || strtotime($event['created_at'])===false)throw new InvalidArgumentException('invalid_order_event_projection');
            $ids[$event['id']]=true;$events[]=array_intersect_key($event,array_flip(['id','type','created_at']));
        }
        $seen[$row['order_id']]=true;
        $result[]=[...array_intersect_key($row,array_flip(['order_id','order_number','status','payment_status','delivery_status','updated_at'])),'events'=>$events];
    }
    return $result;
}

/** Frozen customer/business messages, enqueued in the same publication/notice transaction. */
function ya_commerce_mail_event(PDO $db,array $order,string $eventId,string $type): void
{
    $labels=['payment_reported'=>'Havale bildiriminiz alındı. İşletme doğrulaması bekleniyor.','payment_approve'=>'Ödemeniz işletme tarafından doğrulandı.',
        'payment_reject'=>'Ödeme bildirimi doğrulanamadı. İşletmeyle iletişime geçin.','payment_refund'=>'İşletme havale iadesini kaydetti.',
        'payment_prepare'=>'Siparişiniz hazırlanıyor.','order_confirmed'=>'Siparişiniz onaylandı.','order_cancelled'=>'Siparişiniz iptal edildi.', 'order_delivered'=>'Siparişiniz teslim edildi.','order_refunded'=>'Siparişinizin tam iadesi işletme tarafından kaydedildi.'];
    if(!isset($labels[$type]))return;
    $number=$order['checkout']['order_number']??$order['id'];$body=$number."\n".$labels[$type]."\n";
    $recipient=$order['buyer']['email']??$order['notificationEmail']??'';
    if($recipient!=='')ya_commerce_mail_enqueue($db,$eventId.':customer',$recipient,'Sipariş '.$number,$body);
    $business=getenv('YA_COMMERCE_NOTIFICATION_EMAIL')?:'';
    if($business!=='')ya_commerce_mail_enqueue($db,$eventId.':business',$business,'Sipariş '.$number,$body);
}

function ya_commerce_apply_status_mail(PDO $db,array $statuses): void
{
    foreach($statuses as $status) {
        $order=ya_commerce_find_order($db,$status['order_id']);
        if(!$order)continue;
        foreach($status['events'] as $event)ya_commerce_mail_event($db,$order,$event['id'],$event['type']);
    }
}
