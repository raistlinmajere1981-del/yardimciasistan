UPDATE settings
SET web_module_url = 'https://yardimciasistan.alwaysdata.net/yardimci-asistan',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE lower(rtrim(trim(web_module_url), '/')) IN (
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'https://yardimciasistan.alwaysdata.net'
);
