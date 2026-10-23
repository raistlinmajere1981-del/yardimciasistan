/** Bounded service-test adapter when the sandbox cannot start Electron.
 * Actual native PNG/JPEG/WebP decoding uses @napi-rs/image. This does not prove
 * Electron's nativeImage encoder or preload/browser integration. */
const { Transformer } = require("@napi-rs/image");
const Module = require("node:module");
const paths = new Map();
function wrap(transformer) {
  const bytes = transformer.pngSync();
  return {
    isEmpty: () => false,
    getSize: () => { const { width, height } = new Transformer(bytes).metadataSync(); return { width, height }; },
    resize: ({ width, height }) => wrap(new Transformer(bytes).resize(width, height)),
    toPNG: () => bytes,
    toJPEG: quality => new Transformer(bytes).jpegSync(quality)
  };
}
const electron = {
  nativeImage: {
    createFromBuffer: bytes => { try { return wrap(new Transformer(bytes)); } catch { return { isEmpty: () => true }; } },
    createFromBitmap: (bytes, { width, height }) => wrap(Transformer.fromRgbaPixels(bytes, width, height))
  },
  app: {
    setPath: (key, value) => paths.set(key, value), getPath: key => paths.get(key) ?? paths.get("userData"),
    getVersion: () => "test", isPackaged: false, isReady: () => true,
    whenReady: async () => {}, exit: code => { process.exitCode = code; }
  }
};
const load = Module._load;
Module._load = function (id, ...args) { return id === "electron" ? electron : load.call(this, id, ...args); };
