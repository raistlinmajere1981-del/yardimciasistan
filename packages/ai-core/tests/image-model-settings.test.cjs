const assert = require('node:assert/strict');
const { test } = require('node:test');
const { imageModelForProfile, listGoogleAiStudioModels } = require('../dist');
const { supportsImageGenerationModel, imageGenerationModelOptions } = require('@yardimci-asistan/shared');
test('automatic image selection is independent of the assistant model', () => {
  assert.equal(imageModelForProfile('openai', ['gpt-4.1']), 'gpt-image-1');
  assert.equal(imageModelForProfile('gemini', ['gemini-3-flash', 'gemini-3-pro-image-preview']), 'gemini-3-pro-image-preview');
  assert.equal(supportsImageGenerationModel('gemini', 'gemini-3-flash'), false);
  assert.equal(supportsImageGenerationModel('groq', 'gpt-image-1'), false);
  assert.deepEqual(imageGenerationModelOptions('openai', ['gpt-4.1', 'gpt-image-1', 'gpt-image-1.5']), ['gpt-image-1', 'gpt-image-1.5']);
});

test('Gemini discovery separates image generation from assistant models in one request', async () => {
  let calls = 0;
  const result = await listGoogleAiStudioModels({ baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'fixture-key' }, async () => {
    ++calls;
    return new Response(JSON.stringify({ models: [
      { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-pro-image-preview', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }
    ] }));
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.deepEqual(result.models.map(model => model.id), ['gemini-3-flash']);
  assert.deepEqual(result.imageModels.map(model => model.id), ['gemini-3-pro-image-preview']);
});
