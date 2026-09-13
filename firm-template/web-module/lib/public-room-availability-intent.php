<?php
declare(strict_types=1);

function ya_public_room_availability_extract_intent(string $message, ?DateTimeImmutable $now = null): array
{
    $message = trim($message);
    $normalized = ya_public_room_availability_normalize_text($message);
    $roomTermPattern = '(?:oda(?:lar)?|otel|pansiyon|konaklama)(?:mız|miz|muz|müz|ımız|imiz|umuz|ümüz|nız|niz|nuz|nüz|ınız|iniz|unuz|ünüz)?(?:da|de|ta|te|dan|den|tan|ten|ya|ye|yı|yi|yu|yü|nın|nin|nun|nün)?';
    $roomIntent = preg_match('/\b' . $roomTermPattern . '\b/u', $normalized) === 1;
    $availabilityIntent = preg_match('/(müsait|musait|boş|bos|yer\s+var|rezervasyon)/u', $normalized) === 1
        || preg_match('/\b' . $roomTermPattern . '\s+var(?:\s*m[ıiuü])?\b/u', $normalized) === 1;
    if (!$roomIntent || !$availabilityIntent) {
        return ['applicable' => false, 'complete' => false, 'missing' => []];
    }

    $now ??= new DateTimeImmutable('now', new DateTimeZone('Europe/Istanbul'));
    $guestCount = ya_public_room_availability_extract_guest_count($normalized);
    [$startDate, $endDate] = ya_public_room_availability_extract_dates($normalized, $now);
    $missing = [];
    if ($startDate === '' || $endDate === '') $missing[] = 'date_range';
    if ($guestCount === null) $missing[] = 'guest_count';

    return [
        'applicable' => true,
        'complete' => $missing === [],
        'start_date' => $startDate,
        'end_date' => $endDate,
        'guest_count' => $guestCount,
        'missing' => $missing
    ];
}

function ya_public_room_availability_extract_guest_count(string $normalized): ?int
{
    if (preg_match('/\b(\d{1,2})\s*(?:kişi|kisi|kişilik|kisilik)\b/u', $normalized, $match) === 1) {
        $count = (int) $match[1];
        return $count >= 1 && $count <= 99 ? $count : null;
    }

    if (preg_match_all('/\b(\d{1,2})\s*(?:yetişkin|yetiskin|çocuk|cocuk)\b/u', $normalized, $matches) > 0) {
        $count = array_sum(array_map('intval', $matches[1]));
        return $count >= 1 && $count <= 99 ? $count : null;
    }
    return null;
}

function ya_public_room_availability_extract_dates(string $normalized, DateTimeImmutable $now): array
{
    if (preg_match_all('/\b(20\d{2}-\d{2}-\d{2})\b/', $normalized, $matches) >= 1) {
        $dates = array_values(array_filter($matches[1], 'ya_public_room_availability_intent_valid_iso_date'));
        if (count($dates) >= 2 && $dates[1] > $dates[0]) return [$dates[0], $dates[1]];
        if (count($dates) === 1) return [$dates[0], ya_public_room_availability_add_days($dates[0], 1)];
    }

    if (preg_match_all('/\b(\d{1,2})[.\/](\d{1,2})[.\/](20\d{2})\b/', $normalized, $matches, PREG_SET_ORDER) >= 1) {
        $dates = [];
        foreach ($matches as $match) {
            $date = ya_public_room_availability_make_date((int) $match[3], (int) $match[2], (int) $match[1]);
            if ($date !== '') $dates[] = $date;
        }
        if (count($dates) >= 2 && $dates[1] > $dates[0]) return [$dates[0], $dates[1]];
        if (count($dates) === 1) return [$dates[0], ya_public_room_availability_add_days($dates[0], 1)];
    }

    $monthPattern = ya_public_room_availability_month_pattern();
    if (preg_match('/\b(\d{1,2})\s*(?:-|–|—|ile)\s*(\d{1,2})\s+(' . $monthPattern . ')(?:\s+(20\d{2}))?\b/u', $normalized, $match) === 1) {
        $month = ya_public_room_availability_month_number($match[3]);
        $year = isset($match[4]) && $match[4] !== '' ? (int) $match[4] : ya_public_room_availability_infer_year((int) $match[1], $month, $now);
        $start = ya_public_room_availability_make_date($year, $month, (int) $match[1]);
        $end = ya_public_room_availability_make_date($year, $month, (int) $match[2]);
        if ($start !== '' && $end !== '' && $end > $start) return [$start, $end];
    }

    if (preg_match_all('/\b(\d{1,2})\s+(' . $monthPattern . ')(?:\s+(20\d{2}))?\b/u', $normalized, $matches, PREG_SET_ORDER) >= 1) {
        $dates = [];
        foreach (array_slice($matches, 0, 2) as $index => $match) {
            $month = ya_public_room_availability_month_number($match[2]);
            $year = isset($match[3]) && $match[3] !== ''
                ? (int) $match[3]
                : ($index === 0
                    ? ya_public_room_availability_infer_year((int) $match[1], $month, $now)
                    : (int) substr($dates[0] ?? $now->format('Y-m-d'), 0, 4));
            $date = ya_public_room_availability_make_date($year, $month, (int) $match[1]);
            if ($date !== '') $dates[] = $date;
        }
        if (count($dates) >= 2) {
            if ($dates[1] <= $dates[0] && !isset($matches[1][3])) {
                $dates[1] = ya_public_room_availability_make_date((int) substr($dates[0], 0, 4) + 1, ya_public_room_availability_month_number($matches[1][2]), (int) $matches[1][1]);
            }
            if ($dates[1] > $dates[0]) return [$dates[0], $dates[1]];
        }
        if (count($dates) === 1) return [$dates[0], ya_public_room_availability_add_days($dates[0], 1)];
    }

    if (preg_match('/\byarın\b/u', $normalized) === 1 || preg_match('/\byarin\b/u', $normalized) === 1) {
        $start = $now->modify('+1 day')->format('Y-m-d');
        return [$start, ya_public_room_availability_add_days($start, 1)];
    }
    if (preg_match('/\bbugün\b/u', $normalized) === 1 || preg_match('/\bbugun\b/u', $normalized) === 1 || preg_match('/\bbu gece\b/u', $normalized) === 1) {
        $start = $now->format('Y-m-d');
        return [$start, ya_public_room_availability_add_days($start, 1)];
    }
    return ['', ''];
}

function ya_public_room_availability_incomplete_answer(array $missing): string
{
    $needsDate = in_array('date_range', $missing, true);
    $needsGuest = in_array('guest_count', $missing, true);
    if ($needsDate && $needsGuest) return 'Canlı oda müsaitliğini kontrol edebilmem için tarih aralığını ve kişi sayısını yazar mısınız?';
    if ($needsDate) return 'Canlı oda müsaitliğini kontrol edebilmem için giriş ve çıkış tarihini yazar mısınız?';
    return 'Canlı oda müsaitliğini kontrol edebilmem için kaç kişi olduğunuzu yazar mısınız?';
}

function ya_public_room_availability_answer(array $result): string
{
    if (($result['ok'] ?? false) !== true || ($result['live'] ?? false) !== true) {
        return match ((string) ($result['code'] ?? '')) {
            'availability_stale' => 'Canlı müsaitlik kaydı şu anda yeterince güncel değil; bu nedenle kesin müsaitlik bilgisi vermiyorum. İşletmeye talep bırakabilirsiniz.',
            'availability_not_ready' => 'Canlı müsaitlik kaydı henüz hazır değil. İşletmeye talep bırakabilirsiniz.',
            default => (string) ($result['message'] ?? 'Canlı müsaitlik şu anda doğrulanamıyor.')
        };
    }

    $query = is_array($result['query'] ?? null) ? $result['query'] : [];
    $start = ya_public_room_availability_format_date((string) ($query['start_date'] ?? ''));
    $end = ya_public_room_availability_format_date((string) ($query['end_date'] ?? ''));
    $guests = max(1, (int) ($query['guest_count'] ?? 1));
    $count = max(0, (int) ($result['available_room_count'] ?? 0));
    $prefix = $start !== '' && $end !== '' ? "{$start} – {$end} için {$guests} kişiye uygun" : "{$guests} kişiye uygun";
    if ($count === 0) {
        return "{$prefix} müsait oda görünmüyor. Bu bilgi canlı kayıttan okundu; herhangi bir rezervasyon oluşturulmadı.";
    }

    $rooms = is_array($result['available_rooms'] ?? null) ? $result['available_rooms'] : [];
    $labels = [];
    foreach (array_slice($rooms, 0, 5) as $room) {
        if (!is_array($room)) continue;
        $number = trim((string) ($room['number'] ?? ''));
        $name = trim((string) ($room['name'] ?? ''));
        $capacity = max(0, (int) ($room['capacity'] ?? 0));
        $label = trim(($number !== '' ? $number . ' ' : '') . $name);
        if ($label === '') $label = 'Oda';
        if ($capacity > 0) $label .= " ({$capacity} kişi)";
        $labels[] = $label;
    }
    $extra = $count > count($labels) ? ' ve ' . ($count - count($labels)) . ' oda daha' : '';
    $roomText = $labels !== [] ? ': ' . implode(', ', $labels) . $extra : '';
    return "{$prefix} {$count} müsait oda görünüyor{$roomText}. Bu bilgi canlı kayıttan okundu; herhangi bir rezervasyon oluşturulmadı.";
}

function ya_public_room_availability_format_date(string $iso): string
{
    if (!ya_public_room_availability_intent_valid_iso_date($iso)) return '';
    $months = [1 => 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $iso);
    if (!$date instanceof DateTimeImmutable) return '';
    return (int) $date->format('j') . ' ' . $months[(int) $date->format('n')] . ' ' . $date->format('Y');
}

function ya_public_room_availability_normalize_text(string $value): string
{
    $value = strtr($value, ['İ' => 'i', 'I' => 'ı', 'Ş' => 'ş', 'Ğ' => 'ğ', 'Ü' => 'ü', 'Ö' => 'ö', 'Ç' => 'ç']);
    return strtolower($value);
}

function ya_public_room_availability_month_pattern(): string
{
    return 'ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik';
}

function ya_public_room_availability_month_number(string $month): int
{
    $month = strtr($month, ['ş' => 's', 'ı' => 'i', 'ğ' => 'g', 'ü' => 'u', 'ö' => 'o', 'ç' => 'c']);
    return [
        'ocak' => 1, 'subat' => 2, 'mart' => 3, 'nisan' => 4, 'mayis' => 5, 'haziran' => 6,
        'temmuz' => 7, 'agustos' => 8, 'eylul' => 9, 'ekim' => 10, 'kasim' => 11, 'aralik' => 12
    ][$month] ?? 0;
}

function ya_public_room_availability_infer_year(int $day, int $month, DateTimeImmutable $now): int
{
    $year = (int) $now->format('Y');
    $candidate = ya_public_room_availability_make_date($year, $month, $day);
    if ($candidate !== '' && $candidate < $now->format('Y-m-d')) $year++;
    return $year;
}

function ya_public_room_availability_make_date(int $year, int $month, int $day): string
{
    if (!checkdate($month, $day, $year)) return '';
    return sprintf('%04d-%02d-%02d', $year, $month, $day);
}

function ya_public_room_availability_add_days(string $iso, int $days): string
{
    if (!ya_public_room_availability_intent_valid_iso_date($iso)) return '';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $iso);
    return $date instanceof DateTimeImmutable ? $date->modify(($days >= 0 ? '+' : '') . $days . ' day')->format('Y-m-d') : '';
}

function ya_public_room_availability_intent_valid_iso_date(string $value): bool
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) !== 1) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date instanceof DateTimeImmutable && $date->format('Y-m-d') === $value;
}
