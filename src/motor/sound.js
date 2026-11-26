// motor/sound.js — synthesized car sounds (WebAudio, no files): engine by rpm (exhaust kit changes the voice),
// tyre squeal while drifting, nitro hiss, horn, crash, race beeps. One engine voice at a time (the car you drive).
export function createMotorSound(audio) {
  const A = () => audio && audio.ctx;
  const out = () => audio.room || audio.master;
  const vol = () => ((audio.vol && audio.vol.sfx) ?? 0.9);
  let eng = null, noiseBuf = null;
  function noise() {
    const a = A(); if (!a) return null; if (noiseBuf) return noiseBuf;
    noiseBuf = a.createBuffer(1, a.sampleRate * 1, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return noiseBuf;
  }
  function start(exhaust = 0) {
    const a = A(); if (!a || eng) return;
    try {
      const g = a.createGain(); g.gain.value = 0;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = exhaust === 2 ? 4 : 2.2;
      const o1 = a.createOscillator(); o1.type = 'sawtooth';
      const o2 = a.createOscillator(); o2.type = exhaust ? 'square' : 'triangle';
      const g2 = a.createGain(); g2.gain.value = exhaust === 2 ? 0.55 : exhaust ? 0.4 : 0.22;
      const am = a.createGain(); am.gain.value = 0.6; const lfo = a.createOscillator(); lfo.type = 'square'; const lfoG = a.createGain(); lfoG.gain.value = exhaust ? 0.38 : 0.25;
      lfo.connect(lfoG); lfoG.connect(am.gain);
      // tyres: filtered noise, gain driven by slip
      const ns = a.createBufferSource(); ns.buffer = noise(); ns.loop = true; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 5; const sg = a.createGain(); sg.gain.value = 0;
      ns.connect(bp); bp.connect(sg); sg.connect(out());
      // nitro: high hiss
      const ns2 = a.createBufferSource(); ns2.buffer = noise(); ns2.loop = true; const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800; const ng = a.createGain(); ng.gain.value = 0;
      ns2.connect(hp); hp.connect(ng); ng.connect(out());
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(am); am.connect(g); g.connect(out());
      const t = a.currentTime; o1.start(t); o2.start(t); lfo.start(t); ns.start(t); ns2.start(t);
      g.gain.linearRampToValueAtTime((exhaust === 2 ? 0.16 : exhaust ? 0.13 : 0.1) * vol(), t + 0.5);
      eng = { a, g, lp, o1, o2, lfo, sg, ng, exhaust, nodes: [o1, o2, lfo, ns, ns2], lastThr: 0, popT: 0 };
      sfx('start');
    } catch (e) { eng = null; }
  }
  function set(rpm, thr, slip, nitro) {
    const E = eng; if (!E) return; const t = E.a.currentTime;
    const base = E.exhaust === 2 ? 26 : E.exhaust ? 30 : 36, span = E.exhaust === 2 ? 120 : 105;
    const f = base + rpm * span;
    E.o1.frequency.setTargetAtTime(f, t, 0.05); E.o2.frequency.setTargetAtTime(f * (E.exhaust ? 0.5 : 2.01), t, 0.05);
    E.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    E.lp.frequency.setTargetAtTime(380 + rpm * (E.exhaust ? 2200 : 1500) + thr * 600, t, 0.08);
    E.sg.gain.setTargetAtTime(Math.min(0.09, Math.max(0, slip - 1.4) * 0.025) * vol(), t, 0.06);
    E.ng.gain.setTargetAtTime(nitro ? 0.05 * vol() : 0, t, 0.08);
    // sport exhausts pop when you lift off at high rpm
    E.popT -= 0.016;
    if (E.exhaust && E.lastThr > 0.6 && thr < 0.1 && rpm > 0.55 && E.popT <= 0) { E.popT = 0.4; pops(E.exhaust === 2 ? 4 : 2); }
    E.lastThr = thr;
  }
  function stop() {
    const E = eng; if (!E) return; eng = null; const t = E.a.currentTime;
    try { E.g.gain.cancelScheduledValues(t); E.g.gain.setValueAtTime(E.g.gain.value, t); E.g.gain.linearRampToValueAtTime(0, t + 0.4); E.sg.gain.setTargetAtTime(0, t, 0.05); E.ng.gain.setTargetAtTime(0, t, 0.05); for (const n of E.nodes) n.stop(t + 0.5); } catch (e) { }
  }
  function pops(n) {
    const a = A(); if (!a) return; const t = a.currentTime;
    for (let i = 0; i < n; i++) { try { const s = a.createBufferSource(); s.buffer = noise(); const g = a.createGain(); const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; const tt = t + i * 0.07 + Math.random() * 0.03; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.14 * vol(), tt + 0.005); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.06); s.connect(lp); lp.connect(g); g.connect(out()); s.start(tt, Math.random() * 0.5, 0.08); } catch (e) { } }
  }
  function tone(freqs, dur, type = 'square', v = 0.08, attack = 0.01) {
    const a = A(); if (!a) return; const t = a.currentTime;
    try { const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * vol(), t + attack); g.gain.setValueAtTime(v * vol(), t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur); g.connect(out());
      for (const f of freqs) { const o = a.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.02); } } catch (e) { }
  }
  function sfx(k, x = 1) {
    if (k === 'horn') return tone([392, 494], 0.45, 'square', 0.07);
    if (k === 'beep') return tone([660], 0.18, 'square', 0.08);
    if (k === 'go') return tone([990, 1320], 0.5, 'square', 0.09);
    if (k === 'cp') return tone([880, 1175], 0.12, 'triangle', 0.07);
    if (k === 'lap') return tone([660, 880, 1320], 0.3, 'triangle', 0.08);
    if (k === 'start') return tone([110, 140], 0.25, 'sawtooth', 0.05, 0.02);
    if (k === 'buy') return tone([1046, 1568], 0.16, 'triangle', 0.07);
    if (k === 'crash') { audio && audio.sfx && (audio.sfx('thud', Math.min(1, x)), audio.sfx('clank', Math.min(1, x * 0.8))); return; }
    if (k === 'click') { audio && audio.sfx && audio.sfx('click', 0.4); return; }
  }
  return { start, set, stop, sfx, get on() { return !!eng; } };
}
