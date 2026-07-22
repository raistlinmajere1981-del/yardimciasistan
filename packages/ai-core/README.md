# AI Core

AI provider bağımsız adapter, prompt ve knowledge okuma altyapısı burada geliştirilir.

İlk kapsam:

- `loadKnowledgeDocuments()`: firma markdown bilgi dosyalarını sınırlandırarak okur.
- `buildWebChatMessages()`: web AI sohbeti için güvenli sistem promptu ve mesaj listesini hazırlar.
- `generateOpenAICompatibleChat()`: OpenAI uyumlu `/chat/completions` endpointine istek atar.
- `listGoogleAiStudioModels()`: Google AI Studio anahtarıyla resmi Gemini Models API'sinden güncel ve kararlı 3.1/3.5/3.6 görsel + metin modellerini listeler; ses/canlı/görsel üretim/embedding, preview/latest alias ve yeni hesaplara kapalı 2.x modellerini gizler.
- `verifyGoogleAiStudioVisionModel()`: Seçilen Gemini modelini küçük bir gerçek görsel ve JSON yanıt isteğiyle doğrular.
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
