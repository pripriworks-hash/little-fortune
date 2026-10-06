// Sound and confetti. Sounds are synthesized with the Web Audio API, so there are no audio files.
(function () {
  "use strict";

  // ---------- Sound ----------
  var ctx = null;
  var master = null;
  var noise = null;
  var muted = false;
  var rattleTimer = null;
  try { muted = localStorage.getItem("fortune-sound") === "off"; } catch (e) { /* ignore */ }

  // Browsers only allow audio after the visitor has interacted with the page,
  // so the audio context is created on the first tap, click or key press.
  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var data = noise.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
  }
  ["pointerdown", "keydown", "touchend"].forEach(function (type) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  });

  function canPlay() { return !muted && ctx; }
  function rand(min, max) { return min + Math.random() * (max - min); }

  // A burst of filtered noise: the building block for the rattle, crack and rustle.
  function burst(t, o) {
    var src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = o.type || "bandpass";
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t + o.dur);
    filter.Q.value = o.q || 1;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  // A light slip of paper tapping the inside of a hollow shell. The body of the sound is
  // two soft, low "box" resonances rather than a click, with only a faint papery touch on
  // top, and sometimes a short slide as the slip skims the wall before it lands.
  function tick(t, level) {
    var box = rand(360, 560);
    if (Math.random() < 0.5) {
      burst(t - 0.07, { freq: rand(1600, 2600), q: 0.7, gain: 0.03 * level, dur: 0.08, attack: 0.04 });
    }
    burst(t, { freq: box, q: 5, gain: 1.1 * level, dur: 0.11, attack: 0.004 });
    burst(t, { freq: box * rand(1.7, 2.1), q: 4, gain: 0.4 * level, dur: 0.07, attack: 0.004 });
    burst(t, { freq: rand(1800, 3000), q: 0.8, gain: 0.04 * level, dur: 0.03, attack: 0.005 });
  }

  function rattleStart() {
    if (!canPlay() || rattleTimer) return;
    (function loop() {
      if (canPlay()) tick(ctx.currentTime + 0.08, rand(0.5, 1));
      // Uneven, like something loose: usually a gap, now and then a quick double tap.
      rattleTimer = setTimeout(loop, Math.random() < 0.3 ? rand(55, 80) : rand(120, 210));
    })();
  }

  function rattleStop() {
    clearTimeout(rattleTimer);
    rattleTimer = null;
  }

  // The harder shake right after tapping, building up to the crack.
  function shake(seconds) {
    rattleStop();
    if (!canPlay()) return;
    var t0 = ctx.currentTime;
    for (var t = 0.08; t < seconds - 0.04; t += rand(0.07, 0.11)) {
      tick(t0 + t, 0.7 + 0.5 * (t / seconds));
    }
  }

  // A crisp, brittle, high-pitched snap: the wafer bends, gives, then breaks.
  function crack() {
    if (!canPlay()) return;
    var t = ctx.currentTime;
    burst(t, { type: "highpass", freq: 5200, gain: 0.3, dur: 0.018, attack: 0.001 });
    var snap = t + 0.035;
    burst(snap, { type: "highpass", freq: 3600, gain: 0.85, dur: 0.045, attack: 0.001 });
    burst(snap, { freq: 6400, q: 2.5, gain: 0.5, dur: 0.07, attack: 0.001 });
    burst(snap, { freq: 2300, q: 1.5, gain: 0.22, dur: 0.05, attack: 0.001 });
    // Dry little shards breaking off just after the main snap.
    for (var i = 0; i < 7; i++) {
      burst(snap + rand(0.03, 0.22), { freq: rand(4000, 9000), q: 5, gain: rand(0.08, 0.26), dur: rand(0.012, 0.03), attack: 0.001 });
    }
  }

  // Soft paper crinkle as the slip slides out and unfolds: lots of tiny, irregular,
  // papery grains over a faint bed of air, thickest in the middle.
  function rustle(seconds) {
    if (!canPlay()) return;
    var t0 = ctx.currentTime;
    burst(t0, { type: "highpass", freq: 4200, gain: 0.035, dur: seconds, attack: seconds * 0.4 });
    for (var t = 0; t < seconds; t += rand(0.012, 0.05)) {
      var swell = Math.sin(Math.PI * (t / seconds));
      burst(t0 + t, {
        freq: rand(3000, 8500), q: rand(0.8, 2.5),
        gain: rand(0.02, 0.1) * (0.35 + 0.65 * swell),
        dur: rand(0.01, 0.035), attack: 0.002
      });
    }
  }

  function setMuted(value) {
    muted = !!value;
    if (muted) rattleStop();
    try { localStorage.setItem("fortune-sound", muted ? "off" : "on"); } catch (e) { /* ignore */ }
  }

  // ---------- Confetti ----------
  var COLORS = ["#ffc400", "#ffe38a", "#fff6e0", "#ffffff", "#ffb3a7", "#ff8fa3", "#7fd6cf"];
  var canvas = null;
  var g = null;
  var particles = [];
  var frame = null;
  var lastTime = 0;

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Spills sparkles and confetti outward from the edges of `rect` (viewport coordinates).
  // Each piece lives 3 to 4 seconds and spends the second half of that fading out.
  function confetti(rect) {
    if (!canvas) {
      canvas = document.getElementById("confetti");
      if (!canvas || !canvas.getContext) return;
      g = canvas.getContext("2d");
      window.addEventListener("resize", function () { if (frame) sizeCanvas(); });
    }
    sizeCanvas();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var count = window.innerWidth < 600 ? 80 : 130;

    for (var i = 0; i < count; i++) {
      // Start somewhere on the edge of the slip and fly away from its center.
      var a = Math.random() * Math.PI * 2;
      var x = cx + Math.cos(a) * rect.width * 0.5 * rand(0.75, 1);
      var y = cy + Math.sin(a) * rect.height * 0.5 * rand(0.75, 1);
      var speed = rand(60, 360);
      var kind = Math.random();
      particles.push({
        kind: kind < 0.4 ? "star" : kind < 0.65 ? "dot" : "paper",
        x: x, y: y,
        vx: Math.cos(a) * speed * 1.25,
        vy: Math.sin(a) * speed * 0.8 - rand(60, 200),
        size: rand(4, 10),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        spin: rand(-6, 6),
        angle: rand(0, Math.PI * 2),
        phase: rand(0, Math.PI * 2),
        delay: i < count * 0.65 ? 0 : rand(0, 0.7),
        age: 0,
        life: rand(3, 4)
      });
    }
    if (!frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(step);
    }
  }

  function step(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.2);
    lastTime = now;
    g.clearRect(0, 0, window.innerWidth, window.innerHeight);

    particles = particles.filter(function (p) {
      if (p.delay > 0) { p.delay -= dt; return true; }
      p.age += dt;
      if (p.age >= p.life) return false;

      var drag = Math.pow(0.18, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + (p.kind === "paper" ? 150 : 55) * dt;
      p.x += p.vx * dt + Math.sin(p.age * 3 + p.phase) * 14 * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;

      var fade = Math.min(1, (p.life - p.age) / (p.life * 0.5));
      var twinkle = 0.65 + 0.35 * Math.sin(p.age * 9 + p.phase);
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = p.color;
      if (p.kind === "paper") {
        g.globalAlpha = fade;
        g.rotate(p.angle);
        g.scale(1, Math.cos(p.age * 5 + p.phase));
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.kind === "dot") {
        g.globalAlpha = fade * twinkle;
        g.beginPath();
        g.arc(0, 0, p.size / 4, 0, Math.PI * 2);
        g.fill();
      } else {
        // Four-point sparkle.
        var r = p.size * twinkle;
        g.globalAlpha = fade * twinkle;
        g.rotate(p.angle * 0.2);
        g.beginPath();
        g.moveTo(0, -r);
        g.quadraticCurveTo(0, 0, r, 0);
        g.quadraticCurveTo(0, 0, 0, r);
        g.quadraticCurveTo(0, 0, -r, 0);
        g.quadraticCurveTo(0, 0, 0, -r);
        g.fill();
      }
      g.restore();
      return true;
    });

    frame = particles.length ? requestAnimationFrame(step) : null;
    if (!frame) g.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function clearConfetti() {
    particles = [];
  }

  window.FX = {
    rattleStart: rattleStart,
    rattleStop: rattleStop,
    shake: shake,
    crack: crack,
    rustle: rustle,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    confetti: confetti,
    clearConfetti: clearConfetti
  };
})();
