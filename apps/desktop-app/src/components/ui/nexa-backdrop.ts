type Bounds = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;
type Point = [number, number];

/** Closed subpaths joined by retraced bridges form independent evenodd holes. */
export function nexaBackdropClip(character: Bounds | null, speech: Bounds | null, zoom = 1, speechRadius = 0, speechTail = 0): string {
  const origin = "0 var(--backdrop-cutout-top)";
  const points = [origin, "100% var(--backdrop-cutout-top)", "100% 100%", "0 100%", origin];
  function hole(path: Point[]) {
    const coordinates = path.map(([x, y]) => `${(x / zoom).toFixed(2)}px ${(y / zoom).toFixed(2)}px`);
    if (coordinates.length) points.push(...coordinates, coordinates[0]!, origin);
  }
  if (character && character.width > 0 && character.height > 0) {
    // Follow artwork, excluding the stage's ground space and sidebar margins.
    hole(Array.from({ length: 48 }, (_, i): Point => {
      const angle = i * Math.PI / 24;
      // A small proportional margin keeps the animated crown/fins undimmed.
      return [character.left + character.width / 2 + character.width * .56 * Math.cos(angle),
        character.top + character.height / 2 + character.height * .56 * Math.sin(angle)];
    }));
  }
  if (speech && speech.width > 0 && speech.height > 0) {
    const { left, top, width, height } = speech;
    const radius = Math.min(speechRadius, width / 2, height / 2);
    const corners: Point[] = [[left + width - radius, top + radius], [left + width - radius, top + height - radius],
      [left + radius, top + height - radius], [left + radius, top + radius]];
    const path = corners.flatMap(([cx, cy], corner) => {
      const arc = Array.from({ length: 9 }, (_, i): Point => {
        const angle = (-90 + corner * 90 + i * 90 / 8) * Math.PI / 180;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
      });
      if (corner === 1 && speechTail > 0) {
        const tail = Math.min(speechTail, width / 2 - radius);
        arc.push([left + width / 2 + tail, top + height], [left + width / 2, top + height + tail], [left + width / 2 - tail, top + height]);
      }
      return arc;
    });
    hole(path);
  }
  return `polygon(evenodd, ${points.join(", ")})`;
}
