# AI Core

AI provider bağımsız adapter, prompt ve knowledge okuma altyapısı burada geliştirilir.

İlk kapsam:

- `loadKnowledgeDocuments()`: firma markdown bilgi dosyalarını sınırlandırarak okur.
- `buildWebChatMessages()`: web AI sohbeti için güvenli sistem promptu ve mesaj listesini hazırlar.
- `generateOpenAICompatibleChat()`: OpenAI uyumlu `/chat/completions` endpointine istek atar.
- `listGoogleAiStudioModels()`: Google AI Studio anahtarıyla resmi Gemini Models API'sinden `generateContent` destekleyen modelleri listeler.
- `generateGoogleAiStudioChat()`: Yeni Google authorization key'lerini `x-goog-api-key` ile doğrudan Gemini `generateContent` endpointine bağlar.
- `generateWebChatReply()`: AI kapalıyken güvenli fallback, açıkken provider cevabı döndürür.
- `createOwnerReplySuggestion()`: PC tarafı için bağlayıcı karar vermeyen yerel WhatsApp cevap taslağı üretir.
- `generateOwnerReplySuggestion()`: PC tarafında provider açıksa OpenAI uyumlu endpointten JSON cevap taslağı ister; hata, eksik JSON veya bağlayıcı onay dili durumunda yerel güvenli taslağa döner.

AI kesin rezervasyon onayı vermemeli; işletme sahibi onayı gerektiren konularda yardımcı ve temkinli cevaplar üretmelidir.

## Komutlar

```bash
npm run build
npm test
```
