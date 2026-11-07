<?php
declare(strict_types=1);

/** Server-owned payment boundary. Hosted card providers can implement this
 * contract later; browser claims must never produce a verified payment.
 * A future hosted redirect/callback integration needs a separate authenticated
 * settlement operation. Card numbers and CVV never belong to this request.
 */
interface YaCommercePaymentProvider
{
    public function method(): string;
    public function initialStatus(): string;
}

final class YaCommerceBankTransferProvider implements YaCommercePaymentProvider
{
    public function method(): string { return 'bank_transfer'; }
    public function initialStatus(): string { return 'unpaid'; }
}

function ya_commerce_payment_provider(mixed $method): YaCommercePaymentProvider
{
    if ($method === 'bank_transfer') return new YaCommerceBankTransferProvider();
    throw new YaOnlineOrderRejection(422, 'payment_method_unavailable', 'Yalnız havale ile ödeme kullanılabilir.');
}
