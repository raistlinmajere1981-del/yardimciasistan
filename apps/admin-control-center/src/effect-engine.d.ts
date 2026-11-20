declare module "*.mjs" {
  export function mountPhotoEditor(host: HTMLElement, options: { onChange: () => void }): {
    load(scene: unknown): Promise<void>;
    snapshot(): unknown;
    destroy(): void;
  };
}
