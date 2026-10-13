export function installDictationMock() {
  const state = { denied: false, delayPermission: false, resolvePermission: null, supported: ["audio/webm;codecs=opus"],
    recordings: [], tracks: [], requests: 0, bytes: 20, failRecorder: false };
  const bytes = () => {
    const data = new Uint8Array(state.bytes);
    data.set([0x1a, 0x45, 0xdf, 0xa3].slice(0, data.length));
    return data;
  };
  const acquire = async () => {
    state.requests++;
    if (state.denied) throw new DOMException("fixture permission denial", "NotAllowedError");
    const track = { stopped: false, stop() { this.stopped = true; } };
    const stream = { getTracks: () => [track] };
    state.tracks.push(track);
    if (state.delayPermission) return new Promise(resolve => { state.resolvePermission = () => resolve(stream); });
    return stream;
  };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: acquire } });
  window.MediaRecorder = class {
    static isTypeSupported(mime) { return state.supported.includes(mime); }
    constructor(stream, options) {
      if (state.failRecorder) throw new Error("fixture native failure");
      this.stream = stream; this.mimeType = options.mimeType; this.state = "inactive";
      state.recordings.push(this);
    }
    start() { this.state = "recording"; }
    emit() { this.ondataavailable?.({ data: new Blob([bytes()], { type: this.mimeType }) }); }
    stop() {
      this.state = "inactive";
      const ondata = this.ondataavailable, onstop = this.onstop;
      queueMicrotask(() => { ondata?.({ data: new Blob([bytes()], { type: this.mimeType }) }); onstop?.(); });
    }
  };
  window.__dictationMock = state;
}
