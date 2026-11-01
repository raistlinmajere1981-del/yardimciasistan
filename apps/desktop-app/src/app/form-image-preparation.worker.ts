import { prepareFormImage, type FormImagePixels, type FormImageTransform } from "./form-image-perspective";

self.onmessage = (event: MessageEvent<{ source: FormImagePixels; spec: FormImageTransform }>) => {
  try {
    const result = prepareFormImage(event.data.source, event.data.spec);
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch {
    self.postMessage({ error: "Köşeleri sol üstten başlayarak saat yönünde seçin; kenarlar kesişmemeli." });
  }
};
