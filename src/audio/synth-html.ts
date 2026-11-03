/**
 * Builds the offline HTML page hosted in the WebView. Both the SpessaSynth
 * bundle and its AudioWorklet processor are embedded as JS string literals
 * (`<` escaped so they can never close the host `<script>`) and turned into
 * Blob URLs at runtime — nothing is fetched from the network.
 */
export function buildSynthHtml({
  libraryJs,
  processorJs,
}: {
  libraryJs: string;
  processorJs: string;
}): string {
  const literal = (src: string): string => JSON.stringify(src).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/></head><body>
<script>
window.__LIB_SRC = ${literal(libraryJs)};
window.__PROC_SRC = ${literal(processorJs)};

(function () {
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function u8(b64) { var s = atob(b64); var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function blobUrl(src) { return URL.createObjectURL(new Blob([src], { type: "application/javascript" })); }

  var ctx = null, synth = null, seq = null, lib = null;

  function tick() {
    if (seq && !seq.isFinished) {
      post({ type: "progress", sec: seq.currentTime });
      requestAnimationFrame(tick);
    } else if (seq) {
      post({ type: "progress", sec: seq.currentTime });
      post({ type: "ended" });
    }
  }

  async function handle(cmd) {
    try {
      if (cmd.type === "init") {
        ctx = new AudioContext();
        var procUrl = blobUrl(window.__PROC_SRC);
        await ctx.audioWorklet.addModule(procUrl);
        lib = window.SpessaSynthLib;
        synth = new lib.WorkletSynthesizer(ctx);
        post({ type: "ack", id: cmd.id });
      } else if (cmd.type === "loadSf2") {
        await synth.soundBankManager.addSoundBank(u8(cmd.data).buffer, "main");
        await synth.isReady;
        post({ type: "ack", id: cmd.id });
      } else if (cmd.type === "loadMidi") {
        seq = new lib.Sequencer(synth);
        seq.loadNewSongList([u8(cmd.data).buffer]);
        post({ type: "loaded", duration: seq.duration });
        post({ type: "ack", id: cmd.id });
      } else if (cmd.type === "play") {
        await ctx.resume();
        seq.play();
        tick();
      } else if (cmd.type === "pause") {
        seq.pause();
      } else if (cmd.type === "stop") {
        seq.pause();
        seq.currentTime = 0;
        post({ type: "progress", sec: 0 });
      } else if (cmd.type === "seek") {
        seq.currentTime = cmd.sec;
        post({ type: "progress", sec: cmd.sec });
      } else if (cmd.type === "volume") {
        synth.setMasterParameter("masterGain", cmd.value);
      }
    } catch (e) {
      var msg = String((e && e.message) || e);
      if (cmd.id) post({ type: "nack", id: cmd.id, message: msg });
      else post({ type: "error", message: msg });
    }
  }

  window.addEventListener("message", function (ev) {
    var cmd;
    try { cmd = JSON.parse(ev.data); } catch (e) { return; }
    handle(cmd);
  });
})();
</script></body></html>`;
}
