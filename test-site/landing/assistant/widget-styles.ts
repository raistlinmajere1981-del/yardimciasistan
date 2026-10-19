export interface WidgetStyleConfig {
  primaryColor: string;
}

/**
 * Visual-only stylesheet factory for the public web widget.
 * Keeping this separate prevents presentation CSS from turning the widget
 * orchestration entry point into a god file.
 */
export function widgetStyles(rootId: string, widgetConfig: WidgetStyleConfig) {
  return `
    #${rootId} {
      position: fixed;
      right: 18px;
      bottom: var(--ya-widget-bottom, 18px);
      z-index: 2147483000;
      color: #172033;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.4;
      transition: bottom 180ms ease;
    }

    #${rootId} * {
      box-sizing: border-box;
    }

    #${rootId} button,
    #${rootId} input,
    #${rootId} select,
    #${rootId} textarea {
      font: inherit;
    }

    #${rootId} button:focus-visible,
    #${rootId} a:focus-visible,
    #${rootId} input:focus-visible,
    #${rootId} select:focus-visible,
    #${rootId} textarea:focus-visible {
      outline: 3px solid rgba(255, 184, 146, 0.72);
      outline-offset: 2px;
    }

    #${rootId} [hidden] {
      display: none !important;
    }

    #${rootId} .ya-widget-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.9;
    }

    .ya-widget-button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 58px;
      padding: 5px 14px 5px 6px;
      border: 1px solid #d7e4eb;
      border-radius: 20px;
      color: #172f4a;
      background: #f8fbfd;
      box-shadow: 0 6px 20px rgba(18, 45, 70, .12);
      cursor: pointer;
      transition: background-color 180ms ease;
    }
    .ya-widget-button:hover { background: #eef6fa; }
    #${rootId} .ya-widget-launcher-avatar { display: grid; width: 48px; height: 48px; flex: 0 0 auto; place-items: center; }
    .ya-widget-launcher-copy { display: grid; min-width: 0; text-align: left; }
    .ya-widget-launcher-copy strong { font-size: 14px; }
    .ya-widget-launcher-copy small { color: #5e7384; font-size: 11px; }
    #${rootId} .ya-widget-nexa,
    #${rootId} .ya-widget-nexa-fallback { display: block; width: 100%; height: 100%; object-fit: contain; }
    #${rootId} .ya-widget-nexa-welcome { display: block; width: 112px; height: 112px; flex: 0 0 auto; position: relative; }
    #${rootId} .ya-widget-nexa-welcome::after { content: ""; position: absolute; width: 48px; height: 4px; left: 32px; bottom: 2px; border-radius: 50%; background: rgba(18,45,70,.1); filter: blur(2px); }
    #${rootId} .ya-widget-business-mark { display: inline-flex; vertical-align: middle; margin-right: 6px; }
    #${rootId} .ya-widget-business-mark .ya-widget-mark { width: 20px; height: 20px; border-radius: 4px; }
    #${rootId} .ya-widget-business-mark .ya-widget-mark-fallback { font-size: 8px; }
    @media (prefers-color-scheme: dark) {
      .ya-widget-button { background: #1d2e40; color: #eef6fb; border-color: #415668; }
      .ya-widget-button:hover { background: #263d50; }
      .ya-widget-launcher-copy small { color: #c0d2df; }
    }

    .ya-widget-mark {
      width: 34px;
      height: 34px;
      object-fit: contain;
      border-radius: 10px;
    }

    .ya-widget-mark-fallback {
      display: grid;
      place-items: center;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.04em;
    }

    .ya-widget-panel {
      display: flex;
      width: 410px;
      max-width: calc(100vw - 28px);
      max-height: min(710px, calc(100dvh - 36px));
      overflow: hidden;
      flex-direction: column;
      border: 1px solid rgba(47, 111, 94, 0.24);
      border-radius: 24px;
      background: #fff9ef;
      box-shadow: 0 28px 80px rgba(23, 32, 51, 0.26), 0 0 0 5px rgba(47, 111, 94, 0.07);
      transform-origin: right bottom;
    }

    .ya-widget-panel.is-opening {
      animation: ya-widget-panel-in 210ms cubic-bezier(.2,.8,.2,1) both;
    }

    .ya-widget-panel.is-closing {
      animation: ya-widget-panel-out 150ms ease-in both;
      pointer-events: none;
    }

    @keyframes ya-widget-panel-in {
      from { opacity: 0; transform: translateY(14px) scale(.975); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes ya-widget-panel-out {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(.985); }
    }

    .ya-widget-header {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 64px;
      padding: 14px;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, ${widgetConfig.primaryColor}, #18564e 56%, #123d3a);
      isolation: isolate;
    }

    .ya-widget-header::after {
      position: absolute;
      top: -75px;
      right: -45px;
      width: 190px;
      height: 190px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 64%);
      content: "";
      z-index: -1;
    }

    .ya-widget-identity {
      display: flex;
      align-items: center;
      gap: 11px;
      min-width: 0;
    }

    #${rootId} .ya-widget-avatar { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; }
    .ya-widget-title-copy {
      display: grid;
      min-width: 0;
      gap: 3px;
    }

    .ya-widget-title-copy strong {
      overflow: hidden;
      font-size: 15px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-title-copy small {
      max-width: 260px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 11px;
      line-height: 1.35;
    }

    .ya-widget-close {
      display: grid;
      width: 44px;
      height: 44px;
      flex: 0 0 auto;
      place-items: center;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.24);
      border-radius: 14px;
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
    }

    .ya-widget-close:hover {
      background: rgba(255, 255, 255, 0.16);
    }

    .ya-widget-close span {
      font-size: 25px;
      line-height: 1;
      transform: translateY(-1px);
    }

    .ya-widget-notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 9px 13px;
      border-bottom: 1px solid rgba(185, 112, 25, 0.18);
      color: #6c4719;
      background: #fff4df;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.4;
      animation: ya-widget-notice-in 150ms ease-out both;
    }

    .ya-widget-notice-icon {
      display: grid;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 7px;
      color: #8b5b1c;
      background: rgba(255,255,255,.72);
    }

    .ya-widget-notice-icon .ya-widget-icon { width: 13px !important; height: 13px !important; }

    @keyframes ya-widget-notice-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ya-widget-content {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-color: rgba(47, 111, 94, 0.32) transparent;
    }

    .ya-widget-home,
    .ya-widget-subview {
      display: grid;
      gap: 14px;
      padding: 16px;
      animation: ya-widget-view-in 170ms ease-out both;
    }

    @keyframes ya-widget-view-in {
      from { opacity: 0; transform: translateX(7px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .ya-widget-welcome,
    .ya-widget-subview-intro {
      display: flex;
      align-items: flex-start;
      gap: 11px;
    }

    .ya-widget-welcome {
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 13px;
      border: 1px solid rgba(47, 111, 94, 0.13);
      border-radius: 17px 17px 17px 5px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.78), rgba(255, 255, 255, 0.88));
    }

    .ya-widget-subview-intro > span {
      display: grid;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      place-items: center;
      border-radius: 13px;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.15), 0 5px 14px rgba(23, 32, 51, 0.06);
    }

    .ya-widget-kicker {
      color: ${widgetConfig.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }

    .ya-widget-welcome h2,
    .ya-widget-subview-intro h2 {
      margin: 3px 0 3px;
      color: #172033;
      font-size: 17px;
      line-height: 1.25;
    }

    .ya-widget-welcome p,
    .ya-widget-subview-intro p {
      margin: 0;
      color: #626875;
      font-size: 12px;
      line-height: 1.45;
    }

    .ya-widget-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-action-card {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 8px;
      min-width: 0;
      min-height: 72px;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      text-align: left;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .ya-widget-action-card:hover {
      transform: translateY(-2px);
      border-color: rgba(47, 111, 94, 0.36);
      box-shadow: 0 8px 20px rgba(23, 32, 51, 0.07);
    }

    .ya-widget-action-card:active { transform: translateY(0) scale(.985); }

    .ya-widget-action-icon {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 11px;
      color: ${widgetConfig.primaryColor};
      background: #edf6ec;
    }

    .ya-widget-action-copy { display: grid; min-width: 0; gap: 2px; }
    .ya-widget-action-copy strong { color: #172033; font-size: 11px; font-weight: 850; }

    .ya-widget-action-copy small {
      display: -webkit-box;
      overflow: hidden;
      color: #6d737c;
      font-size: 9px;
      font-weight: 600;
      line-height: 1.3;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .ya-widget-action-arrow { display: grid; place-items: center; color: #8b918f; }
    .ya-widget-action-arrow .ya-widget-icon { width: 14px !important; height: 14px !important; }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 40px;
      padding: 8px 11px;
      border: 1px solid #ddd9d0;
      border-radius: 999px;
      color: #24313a;
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 5px 16px rgba(23, 32, 51, 0.04);
      font-size: 11px;
      font-weight: 750;
      cursor: pointer;
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }

    .ya-widget-suggestions button:hover,
    .ya-widget-topic-chips button:hover {
      transform: translateY(-1px);
      border-color: rgba(47, 111, 94, 0.42);
    }

    .ya-widget-context-card,
    .ya-widget-location-card {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px;
      background: #f7faf5;
    }

    .ya-widget-context-card img,
    .ya-widget-context-icon {
      width: 48px;
      height: 42px;
      flex: 0 0 auto;
      border-radius: 10px;
      object-fit: cover;
    }

    .ya-widget-context-icon,
    .ya-widget-location-card > span {
      display: grid;
      place-items: center;
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.14);
    }

    .ya-widget-context-card > div,
    .ya-widget-location-card > div { display: grid; min-width: 0; gap: 2px; }

    .ya-widget-context-card small {
      color: ${widgetConfig.primaryColor};
      font-size: 9px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .ya-widget-context-card strong,
    .ya-widget-location-card strong {
      overflow: hidden;
      color: #172033;
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-location-card > span {
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      border-radius: 12px;
    }

    .ya-widget-location-card p { margin: 0; color: #626875; font-size: 11px; line-height: 1.4; }
    .ya-widget-directions .ya-widget-primary-action { text-decoration: none; }

    .ya-widget-trust,
    .ya-widget-form-note {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      margin: 0;
      color: #69707b;
      font-size: 11px;
      line-height: 1.45;
    }

    .ya-widget-trust .ya-widget-icon,
    .ya-widget-form-note .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
      color: ${widgetConfig.primaryColor};
    }

    .ya-widget-subview-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .ya-widget-subview-nav > button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 40px;
      padding: 7px 9px;
      border: 0;
      border-radius: 11px;
      color: #58606f;
      background: transparent;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }

    .ya-widget-subview-nav > button:hover {
      color: #172033;
      background: rgba(255, 255, 255, 0.76);
    }

    .ya-widget-active-flow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 999px;
      color: ${widgetConfig.primaryColor};
      background: #eef6ed;
      font-size: 11px;
      font-weight: 800;
    }

    .ya-widget-active-flow .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
    }

    .ya-widget-subview-intro {
      padding: 0 2px;
    }

    .ya-widget-form,
    .ya-widget-ai,
    .ya-widget-direct-whatsapp {
      display: grid;
      gap: 12px;
    }

    .ya-widget-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .ya-widget-field {
      display: grid;
      min-width: 0;
      gap: 6px;
      color: #172033;
      font-size: 12px;
      font-weight: 800;
    }

    .ya-widget-field small {
      color: #777d87;
      font-size: 10px;
      font-weight: 600;
    }

    .ya-widget-field input,
    .ya-widget-field textarea {
      width: 100%;
      min-height: 44px;
      padding: 10px 11px;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      color: #172033;
      background: rgba(255, 255, 255, 0.94);
      font-size: 13px !important;
      font-weight: 500;
    }

    .ya-widget-field textarea {
      min-height: 64px;
      resize: vertical;
    }

    .ya-widget-field input::placeholder,
    .ya-widget-field textarea::placeholder {
      color: #777d87;
      opacity: 1;
    }

    .ya-widget-date-group,
    .ya-widget-guest-group {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .ya-widget-date-group {
      position: relative;
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 15px;
      background: linear-gradient(135deg, rgba(231, 240, 230, 0.75), rgba(255, 255, 255, 0.78));
    }

    .ya-widget-date-group legend,
    .ya-widget-guest-group legend {
      margin-bottom: 7px;
      padding: 0;
      color: #172033;
      font-size: 12px;
      font-weight: 850;
    }

    .ya-widget-date-options {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .ya-widget-date-options > button,
    .ya-widget-date-custom {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      min-width: 0;
      min-height: 42px;
      padding: 7px 5px;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.9);
      font-size: 10px;
      font-weight: 800;
      text-align: center;
      cursor: pointer;
    }

    .ya-widget-date-options > button.is-active,
    .ya-widget-date-custom.is-active {
      color: ${widgetConfig.primaryColor};
      border-color: rgba(47, 111, 94, 0.5);
      background: #e7f1e6;
      box-shadow: inset 0 0 0 1px rgba(47, 111, 94, 0.07);
    }

    .ya-widget-date-custom .ya-widget-icon,
    .ya-widget-date-picker .ya-widget-icon {
      width: 14px !important;
      height: 14px !important;
    }

    .ya-widget-date-range {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .ya-widget-date-range-single {
      grid-template-columns: 1fr;
    }

    .ya-widget-schedule-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: end;
      gap: 8px;
    }

    .ya-widget-schedule-row .ya-widget-time-field {
      margin-top: 0;
    }

    .ya-widget-date-picker {
      position: relative;
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .ya-widget-date-picker > span,
    .ya-widget-time-field > span {
      color: #5f6872;
      font-size: 10px;
      font-weight: 800;
    }

    .ya-widget-date-picker > button {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      min-height: 44px;
      padding: 9px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 11px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      cursor: pointer;
      text-align: left;
    }

    .ya-widget-date-picker > button strong {
      min-width: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ya-widget-calendar {
      position: absolute;
      top: 69px;
      right: 10px;
      left: 10px;
      z-index: 24;
      display: grid;
      gap: 8px;
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.2);
      border-radius: 14px;
      background: #fffdf8;
      box-shadow: 0 18px 44px rgba(23, 32, 51, 0.2);
    }

    .ya-widget-calendar[hidden] { display: none; }

    .ya-widget-calendar-head {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) 34px 30px;
      align-items: center;
      gap: 6px;
    }

    .ya-widget-calendar-head > button {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      padding: 0;
      border: 1px solid #e1ddd5;
      border-radius: 10px;
      color: #334048;
      background: #ffffff;
      cursor: pointer;
    }

    .ya-widget-calendar-head > button:disabled { cursor: not-allowed; opacity: .35; }

    .ya-widget-calendar-head > .ya-widget-calendar-close {
      width: 30px;
      height: 30px;
      border-color: transparent;
      color: #6d737c;
      background: #f6f3ed;
      font-size: 19px;
      line-height: 1;
    }

    .ya-widget-calendar-head > .ya-widget-calendar-close:hover {
      color: #172033;
      background: #ece8df;
    }

    .ya-widget-calendar-title { color: #172033; font-size: 12px; font-weight: 850; text-align: center; }

    .ya-widget-calendar-shortcuts {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .ya-widget-calendar-shortcuts button {
      min-height: 28px;
      padding: 5px 8px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 999px;
      color: #52605c;
      background: #f5faf4;
      font-size: 9px;
      font-weight: 800;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease;
    }

    .ya-widget-calendar-shortcuts button:first-child { color: #7a6557; background: #fff8ef; }
    .ya-widget-calendar-shortcuts button:hover:not(:disabled) { transform: translateY(-1px); border-color: rgba(47, 111, 94, 0.34); }
    .ya-widget-calendar-shortcuts button:disabled { cursor: not-allowed; opacity: .38; }

    .ya-widget-calendar-weekdays,
    .ya-widget-calendar-days {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .ya-widget-calendar-weekdays span {
      color: #7a8089;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
    }

    .ya-widget-calendar-days button,
    .ya-widget-calendar-empty { aspect-ratio: 1; min-width: 0; }

    .ya-widget-calendar-days button {
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 9px;
      color: #334048;
      background: transparent;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }

    .ya-widget-calendar-days button:hover:not(:disabled) { border-color: rgba(47, 111, 94, 0.28); background: #f1f7f0; }
    .ya-widget-calendar-days button.is-today { border-color: rgba(47, 111, 94, 0.3); }
    .ya-widget-calendar-days button.is-in-range { border-radius: 7px; background: rgba(47, 111, 94, 0.10); }

    .ya-widget-calendar-days button.is-range-edge,
    .ya-widget-calendar-days button.is-selected {
      color: #ffffff;
      border-color: transparent;
      background: ${widgetConfig.primaryColor};
    }

    .ya-widget-calendar-days button:disabled { color: #c4c5c7; cursor: not-allowed; }

    .ya-widget-time-field {
      position: relative;
      display: grid;
      gap: 5px;
      margin-top: 9px;
    }

    .ya-widget-time-trigger {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 16px;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 42px;
      padding: 8px 10px;
      border: 1px solid #dcd7cf;
      border-radius: 10px;
      color: #334048;
      background: rgba(255, 255, 255, 0.94);
      text-align: left;
      cursor: pointer;
      transition: border-color 130ms ease, box-shadow 130ms ease;
    }

    .ya-widget-time-trigger:hover,
    .ya-widget-time-trigger[aria-expanded="true"] {
      border-color: rgba(47, 111, 94, 0.44);
      box-shadow: 0 0 0 3px rgba(47, 111, 94, 0.08);
    }

    .ya-widget-time-trigger strong {
      font-size: 12px;
      font-weight: 800;
    }

    .ya-widget-time-trigger .ya-widget-icon {
      width: 15px !important;
      height: 15px !important;
      color: ${widgetConfig.primaryColor};
    }

    .ya-widget-time-trigger .ya-widget-icon:last-child {
      justify-self: end;
      color: #8b918f;
      transform: rotate(90deg);
    }

    .ya-widget-time-popover {
      position: absolute;
      top: 66px;
      right: 0;
      z-index: 25;
      width: min(220px, calc(200% + 8px));
      padding: 10px;
      border: 1px solid rgba(47, 111, 94, 0.2);
      border-radius: 14px;
      background: #fffdf8;
      box-shadow: 0 18px 44px rgba(23, 32, 51, 0.2);
      animation: ya-widget-result-in 150ms ease-out both;
    }

    .ya-widget-time-popover[hidden] { display: none; }

    .ya-widget-time-popover-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .ya-widget-time-popover-head > div {
      display: flex;
      align-items: baseline;
      gap: 7px;
    }

    .ya-widget-time-popover-head small {
      color: #777d87;
      font-size: 9px;
      font-weight: 750;
    }

    .ya-widget-time-popover-head strong {
      color: ${widgetConfig.primaryColor};
      font-size: 15px;
      font-weight: 900;
    }

    .ya-widget-time-popover-actions {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .ya-widget-time-popover-actions button {
      min-height: 28px;
      border: 0;
      border-radius: 9px;
      cursor: pointer;
    }

    .ya-widget-time-clear {
      padding: 0 8px;
      color: #6f6258;
      background: #f8f1e8;
      font-size: 9px;
      font-weight: 800;
    }

    .ya-widget-time-clear:disabled {
      cursor: default;
      opacity: .4;
    }

    .ya-widget-time-close {
      display: grid;
      width: 28px;
      place-items: center;
      padding: 0;
      color: #6d737c;
      background: #f3efe7;
      font-size: 19px;
      line-height: 1;
    }

    .ya-widget-time-columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 62px;
      gap: 8px;
    }

    .ya-widget-time-column {
      display: grid;
      gap: 5px;
      min-width: 0;
    }

    .ya-widget-time-column > span {
      color: #6b727c;
      font-size: 9px;
      font-weight: 800;
      text-align: center;
    }

    .ya-widget-time-scroll {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      max-height: 128px;
      padding: 2px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(47, 111, 94, 0.25) transparent;
    }

    .ya-widget-time-minutes {
      grid-template-columns: 1fr;
    }

    .ya-widget-time-scroll button {
      min-height: 32px;
      padding: 4px;
      border: 1px solid transparent;
      border-radius: 8px;
      color: #36444b;
      background: #f5f7f3;
      font-size: 10px;
      font-weight: 800;
      cursor: pointer;
    }

    .ya-widget-time-scroll button:hover {
      border-color: rgba(47, 111, 94, 0.24);
      background: #eef5ec;
    }

    .ya-widget-time-scroll button.is-selected {
      color: #ffffff;
      border-color: transparent;
      background: ${widgetConfig.primaryColor};
      box-shadow: 0 4px 10px rgba(47, 111, 94, 0.18);
    }

    .ya-widget-date-options > input[type="hidden"] {
      display: none;
    }

    .ya-widget-stepper {
      display: grid;
      grid-template-columns: 44px 64px 44px;
      width: max-content;
      overflow: hidden;
      border: 1px solid #dcd7cf;
      border-radius: 12px;
      background: #ffffff;
    }

    .ya-widget-stepper button {
      display: grid;
      min-width: 44px;
      min-height: 44px;
      place-items: center;
      padding: 0;
      border: 0;
      color: ${widgetConfig.primaryColor};
      background: transparent;
      cursor: pointer;
    }

    .ya-widget-stepper button:first-child {
      border-right: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:last-child {
      border-left: 1px solid #e2ddd5;
    }

    .ya-widget-stepper button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .ya-widget-stepper input {
      width: 64px;
      min-width: 0;
      border: 0;
      color: #172033;
      background: transparent;
      text-align: center;
      font-size: 14px !important;
      font-weight: 850;
      appearance: textfield;
    }

    .ya-widget-stepper input::-webkit-inner-spin-button,
    .ya-widget-stepper input::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 10px 13px;
      border-radius: 13px;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
    }

    .ya-widget-primary-action {
      border: 1px solid transparent;
      color: #ffffff;
      background: linear-gradient(135deg, ${widgetConfig.primaryColor}, #1b5a50);
      box-shadow: 0 9px 22px rgba(47, 111, 94, 0.2);
    }

    .ya-widget-secondary-action {
      border: 1px solid rgba(47, 111, 94, 0.24);
      color: ${widgetConfig.primaryColor};
      background: #ffffff;
    }

    .ya-widget-primary-action:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .ya-widget-suggestions,
    .ya-widget-topic-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ya-widget-suggestions button,
    .ya-widget-topic-chips button {
      min-height: 40px;
      padding: 7px 10px;
      font-size: 11px;
      box-shadow: none;
    }

    .ya-widget-suggestions button.is-active,
    .ya-widget-topic-chips button.is-active {
      color: ${widgetConfig.primaryColor};
      border-color: rgba(47, 111, 94, 0.44);
      background: #e9f3e8;
    }

    .ya-widget-ai-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .ya-widget-ai-answer {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 12px;
      border: 1px solid rgba(47, 111, 94, 0.16);
      border-radius: 16px 16px 16px 5px;
      background: linear-gradient(135deg, #edf5ec, #ffffff);
    }

    .ya-widget-ai-answer p {
      display: grid;
      gap: 3px;
      margin: 0;
      min-width: 0;
    }

    .ya-widget-ai-answer strong {
      color: #172033;
      font-size: 11px;
    }

    .ya-widget-ai-answer p span {
      color: #555e68;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-inline-trust {
      padding-top: 2px;
    }

    .ya-widget-primary-action,
    .ya-widget-secondary-action {
      transition: transform 140ms ease, filter 140ms ease, opacity 140ms ease;
    }

    .ya-widget-primary-action:active:not(:disabled),
    .ya-widget-secondary-action:active:not(:disabled) { transform: scale(.985); }

    .ya-widget-primary-action.is-loading { cursor: wait; }

    .ya-widget-spinner {
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: ya-widget-spin 700ms linear infinite;
    }

    @keyframes ya-widget-spin { to { transform: rotate(360deg); } }

    .ya-widget-ai-answer,
    .ya-widget-request-success { animation: ya-widget-result-in 190ms ease-out both; }

    @keyframes ya-widget-result-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ya-widget-message-preview {
      padding: 11px;
      border: 1px solid rgba(47, 111, 94, 0.14);
      border-radius: 14px 14px 4px 14px;
      background: #edf5ec;
    }

    .ya-widget-message-preview > span {
      color: ${widgetConfig.primaryColor};
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .ya-widget-message-preview p {
      margin: 5px 0 0;
      color: #36444b;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .ya-widget-status {
      margin: 0 16px 16px;
      padding: 10px 11px;
      border: 1px solid rgba(228, 120, 99, 0.26);
      border-radius: 12px;
      color: #8b4133;
      background: #fff0e7;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
    }

    @media (max-width: 520px) {
      #${rootId} {
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        pointer-events: none;
      }

      #${rootId} > * {
        pointer-events: auto;
      }

      .ya-widget-button {
        margin: 0 12px max(12px, env(safe-area-inset-bottom));
      }

      .ya-widget-panel {
        width: 100%;
        max-width: none;
        max-height: min(92dvh, 760px);
        border-right: 0;
        border-bottom: 0;
        border-left: 0;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -18px 60px rgba(23, 32, 51, 0.28);
      }

      .ya-widget-content {
        padding-bottom: env(safe-area-inset-bottom);
      }
    }

    @media (max-width: 430px) {
      .ya-widget-header {
        min-height: 86px;
        padding: 12px;
      }

      .ya-widget-title-copy small {
        max-width: 235px;
      }

      .ya-widget-home,
      .ya-widget-subview {
        padding: 14px;
      }

      .ya-widget-field-grid {
        grid-template-columns: 1fr;
      }

      .ya-widget-date-options,
      .ya-widget-date-range {
        grid-template-columns: 1fr 1fr;
      }

      .ya-widget-ai-actions {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 350px) {
      .ya-widget-launcher-copy,
      .ya-widget-launcher-sparkle {
        display: none;
      }

      .ya-widget-button {
        min-width: 58px;
        padding-right: 8px;
      }

      .ya-widget-title-copy small {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ya-widget-button,
      .ya-widget-action-card,
      .ya-widget-suggestions button,
      .ya-widget-topic-chips button,
      .ya-widget-primary-action,
      .ya-widget-secondary-action {
        transition: none;
      }

      #${rootId} .ya-widget-launcher-avatar,
      #${rootId} .ya-widget-avatar,
      .ya-widget-panel.is-opening,
      .ya-widget-panel.is-closing,
      .ya-widget-home,
      .ya-widget-subview,
      .ya-widget-notice,
      .ya-widget-ai-answer,
      .ya-widget-request-success,
      .ya-widget-spinner {
        animation: none;
      }
      #${rootId} .ya-widget-launcher-avatar { transition: none; }
    }
  `;
}
