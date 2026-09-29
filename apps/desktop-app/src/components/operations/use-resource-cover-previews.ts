import { useEffect, useState } from "react";
import type { PublicResourceCoverPreview } from "@yardimci-asistan/shared";

type ResourceKind = "room" | "table";

export function useResourceCoverPreviews(kind: ResourceKind, revision: number | undefined) {
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const bridge = window.yardimciDesktop;
    const load = kind === "room"
      ? bridge?.listRoomMediaCoverPreviews
      : bridge?.listTableMediaCoverPreviews;

    if (!load) {
      setPreviews({});
      return;
    }

    void load()
      .then((items: PublicResourceCoverPreview[]) => {
        if (cancelled) return;
        setPreviews(Object.fromEntries(
          items
            .filter((item) => item.resourceId && item.previewDataUrl)
            .map((item) => [item.resourceId, item.previewDataUrl])
        ));
      })
      .catch(() => {
        if (!cancelled) setPreviews({});
      });

    return () => {
      cancelled = true;
    };
  }, [kind, revision]);

  return previews;
}
