import type { NexaState } from "./nexa";

export interface NexaGesture {
  gazeX: number; gazeY: number; tilt: number; nod: number;
  blink: number; surprise: number; smile: number;
}
const resting = (): NexaGesture => ({ gazeX: 0, gazeY: 0, tilt: 0, nod: 0, blink: 0, surprise: 0, smile: 0 });
type Gesture = "left" | "right" | "up" | "down" | "curious-left" | "curious-right" | "hover" | "press";
const idleGestures: Gesture[] = ["left", "right", "up", "down", "curious-left", "curious-right"];

/** Presentation only, advanced by the rig's existing clock. No timers, DOM,
 * business events or fabricated status transitions. Random is injectable for tests. */
export function createNexaBehavior(random: () => number = Math.random) {
  const between = (min: number, max: number) => min + random() * (max - min);
  let nextBlink = between(2800, 4800), blinkAt = -Infinity, doubleBlink = false;
  let nextGesture = between(3000, 6500), gestureAt = -Infinity, duration = 0;
  let gesture: Gesture = "left", previous: Gesture | undefined, followed = false;
  let lastInteraction = -Infinity;
  function reset() {
    blinkAt = gestureAt = lastInteraction = -Infinity;
    nextBlink = between(2800, 4800); nextGesture = between(3000, 6500);
    duration = 0; followed = false;
  }
  return {
    reset,
    react(event: "hover" | "press", now: number, state: NexaState) {
      if (state !== "ready" || now - lastInteraction < 2200 && (event !== "press" || gesture === "press")) return;
      gesture = event; gestureAt = now; duration = event === "press" ? 1200 : 1000;
      lastInteraction = now;
      nextGesture = now + duration + between(6000, 14000);
    },
    sample(now: number, state: NexaState): NexaGesture {
      const result = resting();
      if (now >= nextBlink) {
        blinkAt = now; doubleBlink = random() < .23;
        nextBlink = now + between(3600, 9500);
      }
      const blinkTime = now - blinkAt;
      const close = (time: number) => time >= 0 && time <= 180 ? Math.sin(time / 180 * Math.PI) : 0;
      result.blink = Math.max(close(blinkTime), doubleBlink ? close(blinkTime - 310) : 0);
      // Work states own gaze and expression. Interactions are discarded, never queued.
      if (state !== "ready") return result;
      if (now >= nextGesture) {
        const choices = idleGestures.filter(item => item !== previous);
        gesture = choices[Math.floor(random() * choices.length)]!;
        previous = gesture; gestureAt = now; duration = between(1400, 2400);
        const follow = !followed && random() < .2;
        nextGesture = now + duration + (follow ? between(400, 900) : random() < .2 ? between(22000, 32000) : between(6000, 18000));
        followed = follow;
      }
      const progress = (now - gestureAt) / duration;
      if (!(progress >= 0 && progress <= 1)) return result;
      const amount = Math.sin(progress * Math.PI) ** 2;
      if (gesture === "left" || gesture === "curious-left" || gesture === "hover") result.gazeX = -3 * amount;
      if (gesture === "right" || gesture === "curious-right") result.gazeX = 3 * amount;
      if (gesture === "up") result.gazeY = -2.5 * amount;
      if (gesture === "down") result.gazeY = 2 * amount;
      if (gesture === "curious-left" || gesture === "hover") result.tilt = -2.5 * amount;
      if (gesture === "curious-right") result.tilt = 2.5 * amount;
      if (gesture === "press") {
        result.surprise = progress < .25 ? Math.sin(progress / .25 * Math.PI) : 0;
        result.nod = progress >= .25 ? Math.sin((progress - .25) / .75 * Math.PI * 2) * amount * 2 : 0;
        result.smile = amount;
      }
      return result;
    },
  };
}
