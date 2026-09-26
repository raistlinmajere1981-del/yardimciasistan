<?php
declare(strict_types=1);

function ya_google_reviews_fetch_place(
    string $apiKey,
    string $placeId,
    string $fieldMask = 'displayName,rating,userRatingCount,reviews,googleMapsUri'
): array {
    $url = 'https://places.googleapis.com/v1/places/' . rawurlencode($placeId) . '?languageCode=tr';
    $headers = [
        'Accept: application/json',
        'X-Goog-Api-Key: ' . $apiKey,
        'X-Goog-FieldMask: ' . $fieldMask
    ];

    $body = null;
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'message' => 'Google Places bağlantısı başlatılamadı.'];
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_FOLLOWLOCATION => false
        ]);
        $responseBody = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (is_string($responseBody)) {
            $body = $responseBody;
        }
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headers),
                'timeout' => 10,
                'ignore_errors' => true
            ]
        ]);
        $responseBody = @file_get_contents($url, false, $context);
        if (is_string($responseBody)) {
            $body = $responseBody;
        }
        $responseHeaders = $http_response_header ?? [];
        foreach ($responseHeaders as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/', (string)$header, $match) === 1) {
                $status = (int)$match[1];
                break;
            }
        }
    }

    if ($body === null) {
        return ['ok' => false, 'status' => $status, 'message' => 'Google Places servisine ulaşılamadı.'];
    }

    $decoded = json_decode($body, true);
    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        return [
            'ok' => false,
            'status' => $status,
            'message' => ya_google_reviews_error_message($status)
        ];
    }

    return ['ok' => true, 'status' => $status, 'place' => $decoded];
}

function ya_google_reviews_normalize_place(array $place, int $maxReviews = 5): array
{
    $reviews = [];
    foreach (array_slice(is_array($place['reviews'] ?? null) ? $place['reviews'] : [], 0, max(0, $maxReviews)) as $review) {
        if (!is_array($review)) continue;
        $text = trim((string)($review['text']['text'] ?? ''));
        if ($text === '') continue;
        $authorUri = (string)($review['authorAttribution']['uri'] ?? '');
        $authorPhotoUri = (string)($review['authorAttribution']['photoUri'] ?? '');
        $reviewMapsUri = (string)($review['googleMapsUri'] ?? '');
        $reviews[] = [
            'author' => trim((string)($review['authorAttribution']['displayName'] ?? 'Google kullanıcısı')),
            'author_uri' => filter_var($authorUri, FILTER_VALIDATE_URL) ? $authorUri : '',
            'author_photo_uri' => filter_var($authorPhotoUri, FILTER_VALIDATE_URL) ? $authorPhotoUri : '',
            'rating' => max(0, min(5, (int)($review['rating'] ?? 0))),
            'relative_time' => trim((string)($review['relativePublishTimeDescription'] ?? '')),
            'text' => $text,
            'google_maps_uri' => filter_var($reviewMapsUri, FILTER_VALIDATE_URL) ? $reviewMapsUri : ''
        ];
    }

    return [
        'available' => true,
        'stale' => false,
        'name' => trim((string)($place['displayName']['text'] ?? '')),
        'rating' => is_numeric($place['rating'] ?? null) ? (float)$place['rating'] : null,
        'user_rating_count' => max(0, (int)($place['userRatingCount'] ?? 0)),
        'google_maps_uri' => filter_var((string)($place['googleMapsUri'] ?? ''), FILTER_VALIDATE_URL)
            ? (string)$place['googleMapsUri']
            : '',
        'reviews' => $reviews
    ];
}

function ya_google_reviews_error_message(int $status): string
{
    return match ($status) {
        400, 404 => 'Google Place ID doğrulanamadı. İşletmenin Place ID değerini kontrol edin.',
        401, 403 => 'Google bağlantısı reddedildi. API anahtarı, Places API (New), faturalandırma ve anahtar kısıtlamalarını kontrol edin.',
        429 => 'Google Places istek kotası geçici olarak doldu.',
        default => $status > 0
            ? 'Google Places bağlantısı doğrulanamadı (HTTP ' . $status . ').'
            : 'Google Places servisine ulaşılamadı.'
    };
}
