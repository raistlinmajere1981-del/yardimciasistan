import type { HTMLAttributes, ImgHTMLAttributes } from "react";

/** A preview never owns media loading, selection, ordering or persistence. */
export function MediaPreview({ src, alt, fit = "contain", surface = "field", loading, children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & {
  src?: string | undefined;
  alt: string;
  fit?: "contain" | "cover";
  surface?: "field" | "surface";
  loading?: ImgHTMLAttributes<HTMLImageElement>["loading"];
}) {
  return <div className={`media-preview media-preview--${fit} media-preview--${surface} ${className}`.trim()} {...props}>
    {src ? <img src={src} alt={alt} loading={loading} /> : children}
  </div>;
}
