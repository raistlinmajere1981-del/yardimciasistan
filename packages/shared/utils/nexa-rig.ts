import type { NexaState } from "./nexa";
import { createNexaBehavior } from "./nexa-behavior";

/** Locally authored aquatic artwork and presentation only. Presence owns all
 * semantic transitions; this controller never schedules a business reaction.
 * The V2 lab remains an executable design reference. No remote SVG is accepted. */
export type NexaRigState = NexaState | "sleep";
type Expression = "idle" | "thinking" | "speaking" | "success" | "concerned" | "listening";
const expressionTitles: Record<Expression, string> = {
  idle: "Sakin", thinking: "Düşünen", speaking: "Konuşan", success: "Sevinen", concerned: "Dikkatli", listening: "Dinleyen",
};
function expressionFor(state: NexaRigState): Expression {
  switch (state) {
    case "thinking": return "thinking";
    case "speaking": return "speaking";
    case "pleased": return "success";
    case "concerned": return "concerned";
    case "listening": return "listening";
    case "ready": case "sleep": return "idle";
  }
}
export interface NexaRigOptions {
  state: NexaRigState;
  motion: boolean;
  size: number;
  /** Opt-in until other surfaces explicitly adopt the Desktop behavior. */
  natural?: boolean;
}
export interface NexaRigController {
  update(options: NexaRigOptions): void;
  react(event: "hover" | "press"): void;
  unmount(): void;
}
type Part = "crown" | "side-fin" | "far-fin" | "tail" | "ribbon";
interface Eye { white: SVGElement; clip: SVGElement; lid: SVGElement; pupil: SVGElement; brow: SVGElement }
interface Rig {
  svg: SVGSVGElement; state: NexaRigState; elapsed: number; phase: number;
  parts: Record<Part, SVGElement>; eyes: Eye[];
  mouth: SVGElement; mouthLine: SVGElement; mouthLight: SVGElement;
  lightOne: SVGElement; lightTwo: SVGElement; successLight: SVGElement;
  presence: SVGElement; natural: boolean; behavior: ReturnType<typeof createNexaBehavior>;
}
let serial = 0;
function markup(id: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" data-nexa-rig="" style="display:block;width:100%;height:100%;overflow:visible;transform:none;animation:none" viewBox="0 0 200 200" role="img" aria-label="Nexa">
      <style>
        #${id} *{animation:none;transition:none}
        #${id} .nexa-rig-edge{fill:none;stroke-linecap:round;stroke-linejoin:round}
        #${id} .nexa-rig-brow{fill:none;stroke:#153c63;stroke-width:3.5;stroke-linecap:round}
        #${id} .nexa-rig-lid-edge{fill:none;stroke:#234969;stroke-width:1.4;stroke-linecap:round}
        #${id} .nexa-rig-mouth-line{fill:none;stroke:#103859;stroke-width:3;stroke-linecap:round}
        #${id} .nexa-rig-thinking-light,#${id} .nexa-rig-success-highlight{opacity:0}
        #${id}[data-expression="thinking"] .nexa-rig-thinking-light{opacity:.8}
        #${id}[data-expression="success"] .nexa-rig-success-highlight{opacity:.8}
        #${id}[data-size="small"] .nexa-rig-micro-hide{display:none}
        #${id}[data-size="small"] .nexa-rig-brow{stroke-width:4.3}
        #${id}[data-size="small"] .nexa-rig-mouth-line{stroke-width:4}
        #${id} .nexa-rig-eye-spark{fill:#fff}
        #${id} .nexa-rig-mouth-fill{fill:#103859;stroke:#1a5172;stroke-width:1}
      </style>
      <defs>
        <linearGradient id="${id}-body" x1=".13" y1=".1" x2=".85" y2=".95" gradientUnits="objectBoundingBox"><stop stop-color="#9becf3" style="stop-color:#9becf3"/><stop offset=".25" stop-color="#51c7df" style="stop-color:#51c7df"/><stop offset=".58" stop-color="#248ac5" style="stop-color:#248ac5"/><stop offset=".86" stop-color="#15508f" style="stop-color:#15508f"/><stop offset="1" stop-color="#11385f" style="stop-color:#11385f"/></linearGradient>
        <radialGradient id="${id}-glass" cx=".33" cy=".25" r=".83"><stop stop-color="#defafa" style="stop-color:#defafa"/><stop offset=".4" stop-color="#9ee7ef" style="stop-color:#9ee7ef"/><stop offset=".72" stop-color="#64c6df" style="stop-color:#64c6df"/><stop offset="1" stop-color="#2f80ad" style="stop-color:#2f80ad"/></radialGradient>
        <linearGradient id="${id}-fin" x1=".2" y1="0" x2=".7" y2="1"><stop stop-color="#b9ffff" stop-opacity=".9" style="stop-color:#b9ffff;stop-opacity:.9"/><stop offset=".38" stop-color="#5bd2e8" stop-opacity=".75" style="stop-color:#5bd2e8;stop-opacity:.75"/><stop offset=".75" stop-color="#268bbb" stop-opacity=".7" style="stop-color:#268bbb;stop-opacity:.7"/><stop offset="1" stop-color="#1d4f8b" stop-opacity=".9" style="stop-color:#1d4f8b;stop-opacity:.9"/></linearGradient>
        <linearGradient id="${id}-ribbon" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="#96f3f2" style="stop-color:#96f3f2"/><stop offset=".3" stop-color="#50dce8" style="stop-color:#50dce8"/><stop offset=".62" stop-color="#29aace" style="stop-color:#29aace"/><stop offset="1" stop-color="#225d9a" style="stop-color:#225d9a"/></linearGradient>
        <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e6ffff" stop-opacity=".96" style="stop-color:#e6ffff;stop-opacity:.96"/><stop offset=".48" stop-color="#a9f7fa" stop-opacity=".7" style="stop-color:#a9f7fa;stop-opacity:.7"/><stop offset="1" stop-color="#67bfed" stop-opacity=".1" style="stop-color:#67bfed;stop-opacity:.1"/></linearGradient>
        <linearGradient id="${id}-crest" x1=".8" y1="0" x2=".2" y2="1"><stop stop-color="#d1ffff" style="stop-color:#d1ffff"/><stop offset=".32" stop-color="#64dbe9" style="stop-color:#64dbe9"/><stop offset=".8" stop-color="#258bc0" style="stop-color:#258bc0"/><stop offset="1" stop-color="#175080" style="stop-color:#175080"/></linearGradient>
        <radialGradient id="${id}-pupil"><stop stop-color="#164c73" style="stop-color:#164c73"/><stop offset=".65" stop-color="#123353" style="stop-color:#123353"/><stop offset="1" stop-color="#0a263f" style="stop-color:#0a263f"/></radialGradient>
        <clipPath id="${id}-eye-l"><path data-eye-clip="left"/></clipPath><clipPath id="${id}-eye-r"><path data-eye-clip="right"/></clipPath>
      </defs>
      <g data-part="tail">
        <path d="M87 134 C107 136 130 139 144 156 C154 173 137 183 110 190 C124 175 114 170 100 166 C83 160 75 149 87 134Z" fill="url(#${id}-fin)" stroke="#48b7d4" stroke-opacity=".5" stroke-width="1" style="fill:url(#${id}-fin);stroke:#48b7d4;stroke-opacity:.5;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M118 149 C151 164 141 177 121 184" stroke="url(#${id}-edge)" stroke-width="1.3" style="stroke:url(#${id}-edge);stroke-width:1.3"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M106 150Q131 161 126 177" stroke="#8fe7ef" stroke-opacity=".32" stroke-width="1" style="stroke:#8fe7ef;stroke-opacity:.32;stroke-width:1"/>
      </g>
      <g data-part="far-fin"><path d="M58 91C42 97 29 110 24 127C39 124 51 124 65 113Z" fill="url(#${id}-fin)" stroke="#68c6df" stroke-opacity=".5" style="fill:url(#${id}-fin);stroke:#68c6df;stroke-opacity:.5"/><path class="nexa-rig-edge" d="M27 123Q43 103 57 101" stroke="url(#${id}-edge)" stroke-width="1.1" style="stroke:url(#${id}-edge);stroke-width:1.1"/></g>
      <g data-part="side-fin">
        <path d="M135 94 C159 110 170 91 182 89 C180 109 163 137 138 136 C132 122 128 108 135 94Z" fill="url(#${id}-fin)" stroke="#72d5e5" stroke-opacity=".4" stroke-width="1" style="fill:url(#${id}-fin);stroke:#72d5e5;stroke-opacity:.4;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M144 111C158 116 174 102 180 93" stroke="url(#${id}-edge)" stroke-width="1.7" style="stroke:url(#${id}-edge);stroke-width:1.7"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M144 119Q162 118 172 108" stroke="#8cdae9" stroke-opacity=".4" stroke-width="1" style="stroke:#8cdae9;stroke-opacity:.4;stroke-width:1"/>
      </g>
      <g data-part="body">
        <path d="M68 48C90 37 124 45 141 66C154 84 156 112 145 134C133 156 111 166 91 161C78 158 72 150 60 146C44 140 39 126 41 110C40 83 48 61 68 48Z" fill="url(#${id}-body)" stroke="#246f9d" stroke-width="1.4" style="fill:url(#${id}-body);stroke:#246f9d;stroke-width:1.4"/>
        <path d="M49 107C46 129 65 139 77 146C91 154 103 151 110 153C102 164 87 160 79 154C64 144 42 145 41 123Z" fill="#153d7b" fill-opacity=".22" style="fill:#153d7b;fill-opacity:.22"/>
        <path d="M124 55C146 68 153 95 148 113C144 128 135 138 124 146C134 128 138 117 140 95C140 76 131 64 124 55Z" fill="#0c427d" fill-opacity=".26" style="fill:#0c427d;fill-opacity:.26"/>
        <path class="nexa-rig-edge" d="M47 101C45 78 52 61 70 51C88 41 107 44 119 49" stroke="url(#${id}-edge)" stroke-width="2" style="stroke:url(#${id}-edge);stroke-width:2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M139 118Q132 144 111 151" stroke="#6ccbe3" stroke-opacity=".54" stroke-width="1.5" style="stroke:#6ccbe3;stroke-opacity:.54;stroke-width:1.5"/>
      </g>
      <g data-part="crown">
        <path d="M61 62C54 49 58 34 72 31C92 29 105 33 122 23C134 17 149 13 166 13C159 28 149 43 132 49C112 54 100 45 83 48C73 50 67 55 61 62Z" fill="url(#${id}-crest)" stroke="#66c6de" stroke-width="1" style="fill:url(#${id}-crest);stroke:#66c6de;stroke-width:1"/>
        <path d="M61 57C75 31 99 50 119 39C137 30 150 20 165 14C151 41 139 48 121 49C101 51 82 40 61 57Z" fill="#2289bc" fill-opacity=".42" style="fill:#2289bc;fill-opacity:.42"/>
        <path class="nexa-rig-edge" d="M61 51C64 31 82 32 98 33C124 35 137 14 165 13" stroke="url(#${id}-edge)" stroke-width="2.2" style="stroke:url(#${id}-edge);stroke-width:2.2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M79 39C104 43 121 31 143 24" stroke="#b4f7fb" stroke-opacity=".55" stroke-width="1" style="stroke:#b4f7fb;stroke-opacity:.55;stroke-width:1"/>
        <path class="nexa-rig-edge" d="M140 31L151 25" stroke="#dbffff" stroke-width="2" stroke-opacity=".7" style="stroke:#dbffff;stroke-opacity:.7;stroke-width:2"/>
      </g>
      <g data-part="face">
        <path d="M69 63C89 52 116 55 131 70C146 85 146 110 129 125C114 137 86 139 66 124C50 112 49 87 58 74C61 69 65 66 69 63Z" fill="#0b5786" fill-opacity=".25" style="fill:#0b5786;fill-opacity:.25"/>
        <path d="M68 65C88 54 115 58 129 72C142 86 141 108 126 121C110 135 84 133 67 120C54 110 52 91 60 76C62 71 65 68 68 65Z" fill="url(#${id}-glass)" stroke="#c0fbf8" stroke-opacity=".43" stroke-width="1.4" style="fill:url(#${id}-glass);stroke:#c0fbf8;stroke-opacity:.43;stroke-width:1.4"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M65 73C81 58 107 60 122 69" stroke="#f0ffff" stroke-opacity=".56" stroke-width="2.7" style="stroke:#f0ffff;stroke-opacity:.56;stroke-width:2.7"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M59 106Q59 114 65 118" stroke="#ddffff" stroke-opacity=".7" stroke-width="2" style="stroke:#ddffff;stroke-opacity:.7;stroke-width:2"/>
        <g data-part="brows"><path class="nexa-rig-brow" data-brow="left"/><path class="nexa-rig-brow" data-brow="right"/></g>
        <g data-part="eyes">
          <g data-eye="left"><path data-eye-white="left" fill="#e9ffff" stroke="#2a6685" stroke-width="1" style="fill:#e9ffff;stroke:#2a6685;stroke-width:1"/><g clip-path="url(#${id}-eye-l)"><g data-pupil="left"><ellipse cx="77" cy="94" rx="6.2" ry="7.8" fill="url(#${id}-pupil)" style="fill:url(#${id}-pupil)"/><circle class="nexa-rig-eye-spark" cx="75" cy="91" r="1.8"/><circle cx="80" cy="97" r=".8" fill="#83dced" style="fill:#83dced"/></g></g><path class="nexa-rig-lid-edge" data-lid="left"/></g>
          <g data-eye="right"><path data-eye-white="right" fill="#e9ffff" stroke="#2a6685" stroke-width="1" style="fill:#e9ffff;stroke:#2a6685;stroke-width:1"/><g clip-path="url(#${id}-eye-r)"><g data-pupil="right"><ellipse cx="114" cy="92" rx="6.2" ry="7.8" fill="url(#${id}-pupil)" style="fill:url(#${id}-pupil)"/><circle class="nexa-rig-eye-spark" cx="112" cy="89" r="1.8"/><circle cx="117" cy="95" r=".8" fill="#83dced" style="fill:#83dced"/></g></g><path class="nexa-rig-lid-edge" data-lid="right"/></g>
        </g>
        <g data-part="muzzle"><path d="M87 102Q96 105 104 101" fill="none" stroke="#e5ffff" stroke-opacity=".33" stroke-width="1.5" stroke-linecap="round" style="fill:none;stroke:#e5ffff;stroke-opacity:.33;stroke-width:1.5;stroke-linecap:round"/><path data-mouth="" class="nexa-rig-mouth-fill"/><path data-mouth-line="" class="nexa-rig-mouth-line"/><path data-mouth-light="" fill="#8adee8" style="fill:#8adee8"/></g>
        <g class="nexa-rig-success-highlight" data-part="cheeks"><path d="M63 105L71 108M122 105L129 101" class="nexa-rig-edge" stroke="#e0ffff" stroke-width="2.4" style="stroke:#e0ffff;stroke-width:2.4"/></g>
      </g>
      <g data-part="ribbon">
        <path d="M41 114C52 132 66 139 91 134C117 130 138 123 157 129C143 129 145 149 130 156C113 165 87 154 67 147C52 144 38 133 41 114Z" fill="url(#${id}-ribbon)" stroke="#4cc2db" stroke-opacity=".7" stroke-width="1" style="fill:url(#${id}-ribbon);stroke:#4cc2db;stroke-opacity:.7;stroke-width:1"/>
        <path d="M44 123C65 146 84 140 107 135C124 131 144 126 155 129C134 136 142 148 125 152C101 155 80 146 67 143C55 140 47 133 44 123Z" fill="#41c4da" fill-opacity=".32" style="fill:#41c4da;fill-opacity:.32"/>
        <path class="nexa-rig-edge" d="M42 116C55 140 76 140 97 135C117 130 139 124 156 129" stroke="url(#${id}-edge)" stroke-width="2.2" style="stroke:url(#${id}-edge);stroke-width:2.2"/>
        <path class="nexa-rig-edge nexa-rig-micro-hide" d="M78 149C106 157 127 160 137 146" stroke="#95e6ee" stroke-opacity=".45" stroke-width="1" style="stroke:#95e6ee;stroke-opacity:.45;stroke-width:1"/>
      </g>
      <g data-part="lights"><circle class="nexa-rig-thinking-light" data-light="one" cx="138" cy="49" r="2.1" fill="#d2ffff" style="fill:#d2ffff"/><circle class="nexa-rig-thinking-light" data-light="two" cx="164" cy="114" r="1.4" fill="#acf5ff" style="fill:#acf5ff"/><path class="nexa-rig-success-highlight nexa-rig-edge" data-success-light="" d="M155 57L159 47M161 61L168 57" stroke="#b6f9f8" stroke-width="2" style="stroke:#b6f9f8;stroke-width:2"/></g>
    </svg>`;
}
const set = (node: SVGElement, attr: string, value: string | number) => node.setAttribute(attr, String(value));
const wave = (time: number, period: number, phase = 0) => Math.sin(time / period * Math.PI * 2 + phase);
function pose(rig: Rig, staticPose = false) {
  const t = staticPose ? 0 : rig.elapsed / 1000;
  const state = expressionFor(rig.state);
  set(rig.svg, "data-expression", state);
  set(rig.svg, "data-nexa-state", rig.state);
  set(rig.svg, "aria-label", `Nexa · ${expressionTitles[state]}`);
  const movement = staticPose ? 0 : 1;
  const gesture = rig.natural && !staticPose && rig.state !== "sleep" ? rig.behavior.sample(rig.elapsed, rig.state) : null;
  const settleNod = state === "success" && !staticPose && t < .9 ? Math.sin(t / .9 * Math.PI * 2) * 1.8 : 0;
  if (rig.natural) {
    const calm = state === "idle" || state === "listening";
    const lift = movement * wave(t, 9.7, rig.phase) * (calm ? 1.4 : .5) + (gesture?.nod ?? 0) + settleNod;
    const tilt = (gesture?.tilt ?? 0) + (state === "listening" ? 2 : 0);
    const breath = 1 + movement * wave(t, 6.8, rig.phase + 1) * .003;
    set(rig.presence, "transform", `translate(0 ${lift.toFixed(3)}) rotate(${tilt.toFixed(3)} 100 110) translate(100 110) scale(${breath.toFixed(4)}) translate(-100 -110)`);
  } else rig.presence.removeAttribute("transform");
  const delight = state === "success" ? (staticPose ? .55 : t < .9 ? .55 + .45 * Math.sin(t / .9 * Math.PI) : .55) : 0;
  const focus = state === "thinking" ? 1 : 0;
  const talk = state === "speaking" ? 1 : 0;
  const crown = -3 * focus - 7 * delight + movement * wave(t, focus ? 4.7 : 7.1, rig.phase) * (focus ? 2.8 : 1.6);
  const fin = -21 * delight - 4 * focus + movement * (wave(t, 6.3, rig.phase + 1) * 2 + talk * Math.max(0, wave(t, 3.6)) * -7);
  set(rig.parts.crown, "transform", `rotate(${crown.toFixed(3)} 75 52)`);
  set(rig.parts["side-fin"], "transform", `rotate(${fin.toFixed(3)} 137 109)`);
  set(rig.parts["far-fin"], "transform", `rotate(${(delight * 11 + movement * wave(t, 8, 2) * 1.5).toFixed(3)} 57 110)`);
  set(rig.parts.tail, "transform", `rotate(${(movement * wave(t, 8.4, rig.phase + 2) * 2.8 - delight * 3).toFixed(3)} 98 146)`);
  set(rig.parts.ribbon, "transform", `rotate(${(movement * wave(t, 6.8, rig.phase + 4) * 1.6 - delight * 2).toFixed(3)} 62 136)`);
  // Long eye contact, short deliberate glance. No fast scanning loop.
  let gazeX = focus ? -2.4 : talk ? 1 : 0, gazeY = focus ? -2.5 : 0;
  if (rig.natural) {
    gazeX += gesture?.gazeX ?? 0; gazeY += gesture?.gazeY ?? 0;
    if (state === "listening") gazeX = 1.5;
  } else if (!staticPose && state !== "success") {
    const cycle = (t + rig.phase) % 8.6;
    const glance = cycle > 3.1 && cycle < 4.8 ? Math.sin((cycle - 3.1) / 1.7 * Math.PI) : 0;
    gazeX += glance * (focus ? 3 : talk ? -2.8 : 2.4);
    gazeY -= glance * (focus ? .7 : .25);
  }
  // The aperture path closes; iris is clipped by actual moving lids.
  const blinkTime = (t + rig.phase * .45) % 7.1;
  const blink = rig.natural ? gesture?.blink ?? 0 : !staticPose && state !== "success" && blinkTime > 5.9 && blinkTime < 6.12 ? Math.sin((blinkTime - 5.9) / .22 * Math.PI) : 0;
  rig.eyes.forEach((eye, i) => {
    const cx = i ? 114 : 77, cy = i ? 92 : 94, width = 13.5;
    let open = rig.state === "sleep" ? .15 : state === "concerned" ? 5.8 : state === "thinking" ? (i ? 4.4 : 5.7) : state === "speaking" ? (i ? 8.5 : 7.5) : state === "success" ? 3 : (i ? 7.2 : 7.7);
    open += (gesture?.surprise ?? 0) * 2.2;
    open = Math.max(.15, open * (1 - blink));
    const happy = state === "success", upper = happy ? cy - 5.5 - open : cy - open * 1.5, lower = happy ? cy - 5.5 + open : cy + open * 1.55;
    const path = `M${cx - width} ${cy}Q${cx} ${upper.toFixed(3)} ${cx + width} ${cy}Q${cx} ${lower.toFixed(3)} ${cx - width} ${cy}Z`;
    set(eye.white, "d", path); set(eye.clip, "d", path);
    set(eye.lid, "d", `M${cx-width} ${cy}Q${cx} ${upper.toFixed(3)} ${cx+width} ${cy}`);
    set(eye.pupil, "transform", `translate(${gazeX.toFixed(3)} ${(gazeY + (happy ? -2 : 0)).toFixed(3)})`);
    let brow;
    if (state === "concerned") brow = i ? "M103 78Q114 74 125 71" : "M65 73Q76 74 86 80";
    else if (state === "thinking") brow = i ? "M103 77Q114 72 125 75" : "M65 76Q76 76 86 82";
    else if (state === "speaking") brow = i ? "M104 73Q114 67 124 72" : "M66 78Q76 74 86 76";
    else if (happy) brow = i ? "M103 76Q114 68 125 74" : "M65 77Q76 70 87 76";
    else brow = i ? "M104 76Q114 73 124 76" : "M66 79Q76 76 86 79";
    set(eye.brow, "d", brow);
    set(eye.brow, "transform", `translate(0 ${(movement * talk * wave(t, 4.2, i) * .7).toFixed(3)})`);
  });
  let mouth = "", mouthLine = "", mouthLight = "";
  if (state === "concerned") mouthLine = "M88 118Q96 110 105 118";
  else if (state === "idle" || state === "listening") mouthLine = `M88 113Q96 ${(121 + (gesture?.smile ?? 0) * 3).toFixed(3)} 104 112`;
  else if (state === "thinking") mouthLine = "M94 116Q100 113 107 114";
  else if (state === "success") { mouth = "M83 110Q96 117 109 108Q107 125 97 126Q87 127 83 110Z"; mouthLight = "M90 122Q98 118 105 120Q98 128 90 122Z"; }
  else {
    const phase = staticPose ? 0 : Math.floor(t * 3.4) % 8;
    if (phase === 3 || phase === 7) mouthLine = "M88 113Q96 119 105 112";
    else if (phase === 2 || phase === 5) { mouth = "M93 111C101 108 105 114 102 121C99 128 91 122 91 117Q91 114 93 111Z"; mouthLight = "M94 121Q98 117 102 120Q98 125 94 121Z"; }
    else if (phase === 1 || phase === 4) { mouth = "M87 113Q98 119 108 112Q105 121 98 121Q91 122 87 113Z"; }
    else { mouth = "M86 111Q96 117 108 110Q107 124 98 125Q88 125 86 111Z"; mouthLight = "M92 122Q99 118 105 120Q99 126 92 122Z"; }
  }
  set(rig.mouth, "d", mouth); set(rig.mouthLine, "d", mouthLine); set(rig.mouthLight, "d", mouthLight);
  set(rig.lightOne, "transform", `translate(${(movement * wave(t, 4.6) * 4).toFixed(3)} ${(-movement * (1 + wave(t, 4.6, 1)) * 3).toFixed(3)})`);
  set(rig.lightTwo, "transform", `translate(${(-movement * wave(t, 5.4) * 3).toFixed(3)} ${(movement * wave(t, 5.4, 2) * 5).toFixed(3)})`);
  rig.successLight.style.opacity = String(state !== "success" ? 0 : staticPose ? .65 : Math.min(1, delight * 1.3));
}

/** Mount into an owned empty host. Throws on unsupported rendering, allowing
 * consumers to retain their manifest-backed image fallback. IDs are unique even
 * when more than one independently bundled consumer shares the document. */
export function mountNexaRig(host: HTMLElement, initial: NexaRigOptions): NexaRigController {
  const doc = host.ownerDocument;
  const view = doc.defaultView;
  if (!view) throw new Error("Nexa rig requires a browser document");
  let id: string;
  do { id = `nexa-rig-${++serial}`; } while (doc.getElementById(id));
  host.innerHTML = markup(id);
  const svg = host.querySelector<SVGSVGElement>("svg");
  if (!svg || typeof svg.createSVGRect !== "function") {
    host.replaceChildren();
    throw new Error("Nexa SVG rendering unavailable");
  }
  const find = (selector: string): SVGElement => {
    const node = svg.querySelector<SVGElement>(selector);
    if (!node) throw new Error(`Missing Nexa rig part: ${selector}`);
    return node;
  };
  const part = (name: Part) => find(`[data-part="${name}"]`);
  // Transform the existing artwork together; paths, palette and proportions stay intact.
  const presence = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  presence.dataset.part = "presence";
  for (const child of [...svg.children]) if (child.tagName.toLowerCase() === "g") presence.append(child);
  svg.append(presence);
  const rig: Rig = {
    svg, state: initial.state, elapsed: 0, phase: 0,
    parts: { crown: part("crown"), "side-fin": part("side-fin"), "far-fin": part("far-fin"), tail: part("tail"), ribbon: part("ribbon") },
    eyes: ["left", "right"].map(side => ({
      white: find(`[data-eye-white="${side}"]`), clip: find(`[data-eye-clip="${side}"]`),
      lid: find(`[data-lid="${side}"]`), pupil: find(`[data-pupil="${side}"]`), brow: find(`[data-brow="${side}"]`),
    })),
    mouth: find("[data-mouth]"), mouthLine: find("[data-mouth-line]"), mouthLight: find("[data-mouth-light]"),
    lightOne: find('[data-light="one"]'), lightTwo: find('[data-light="two"]'), successLight: find("[data-success-light]"),
    presence, natural: initial.natural ?? false, behavior: createNexaBehavior(),
  };
  let options = initial, raf = 0, last = 0, disposed = false;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  let inView = false;
  const active = () => !disposed && (rig.state !== "pleased" || rig.elapsed < 900)
    && (!rig.natural || rig.state !== "concerned" || rig.elapsed < 1200) && options.motion && rig.state !== "sleep" && inView
    && host.isConnected && doc.visibilityState === "visible" && doc.hasFocus() && !reduced.matches;
  function tick(now: number) {
    raf = 0;
    if (!active()) { reconcile(); return; }
    // The small Desktop character needs at most 30 poses per second.
    if (rig.natural && last && now - last < 32) { raf = view!.requestAnimationFrame(tick); return; }
    rig.elapsed += last ? Math.min(now - last, 80) : 0;
    last = now;
    pose(rig);
    raf = view!.requestAnimationFrame(tick);
  }
  function reconcile() {
    if (disposed) return;
    if (raf) view!.cancelAnimationFrame(raf);
    raf = 0; last = 0;
    const running = active();
    svg!.dataset.motionActive = String(running);
    svg!.dataset.size = options.size <= 40 ? "small" : "full";
    pose(rig, !running);
    if (running) raf = view!.requestAnimationFrame(tick);
  }
  const intersection = new view.IntersectionObserver(([entry]) => {
    inView = entry?.isIntersecting ?? false;
    reconcile();
  });
  intersection.observe(host);
  reduced.addEventListener("change", reconcile);
  doc.addEventListener("visibilitychange", reconcile);
  view.addEventListener("focus", reconcile);
  view.addEventListener("blur", reconcile);
  reconcile();
  return {
    update(next) {
      if (disposed) return;
      if (next.state !== rig.state) { rig.state = next.state; rig.elapsed = 0; rig.behavior.reset(); }
      const changed = options.motion !== next.motion || options.size !== next.size
        || options.natural !== next.natural || svg.dataset.nexaState !== next.state;
      rig.natural = next.natural ?? false;
      options = next;
      if (changed) reconcile();
    },
    react(event) {
      if (!rig.natural || !active() || rig.state !== "ready") return;
      rig.behavior.react(event, rig.elapsed, rig.state);
    },
    unmount() {
      if (disposed) return;
      disposed = true;
      if (raf) view.cancelAnimationFrame(raf);
      svg.dataset.motionActive = "false";
      intersection.disconnect();
      reduced.removeEventListener("change", reconcile);
      doc.removeEventListener("visibilitychange", reconcile);
      view.removeEventListener("focus", reconcile);
      view.removeEventListener("blur", reconcile);
      svg.remove();
    },
  };
}
