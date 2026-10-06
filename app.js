(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var views = ["home", "cookie", "send", "ready"];
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var FX = window.FX;
  var MAX_NOTE = 200;
  var DEFAULT_NOTE = "Thinking of you.";

  // ---------- Analytics ----------
  // No tracker is bundled. If Plausible or Google Analytics is added to index.html,
  // these events flow to it: cookie_cracked, cookie_sent, gift_opened, link_copied.
  function track(name, props) {
    try {
      if (typeof window.plausible === "function") window.plausible(name, { props: props || {} });
      else if (typeof window.gtag === "function") window.gtag("event", name, props || {});
    } catch (e) { /* analytics must never break the page */ }
  }

  // ---------- Gift links ----------
  // The names and note live in the URL fragment, which browsers do not send to the server.
  function encodeGift(gift) {
    var bytes = new TextEncoder().encode(JSON.stringify(gift));
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeGift(str) {
    try {
      var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      var bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
      var data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!data || typeof data !== "object") return null;
      var clean = function (v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; };
      return { f: clean(data.f, 40), t: clean(data.t, 40), m: clean(data.m, MAX_NOTE) };
    } catch (e) {
      return null;
    }
  }

  function giftUrl(gift) {
    return location.origin + location.pathname + "#g=" + encodeGift(gift);
  }

  // ---------- Fortunes ----------
  // Draw from a shuffled bag so repeats only happen after every fortune has been seen.
  function draw(key, list) {
    var bag = [];
    try { bag = JSON.parse(sessionStorage.getItem(key)) || []; } catch (e) { /* ignore */ }
    if (!bag.length) {
      bag = list.map(function (_, i) { return i; });
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
    }
    var pick = bag.pop();
    try { sessionStorage.setItem(key, JSON.stringify(bag)); } catch (e) { /* ignore */ }
    return list[pick] || list[0];
  }

  // ---------- Cookie ----------
  var stage = $("stage");
  var timers = [];
  var cookieMode = "self";

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function resetCookie() {
    timers.forEach(clearTimeout);
    timers = [];
    FX.rattleStop();
    FX.clearConfetti();
    stage.dataset.state = "whole";
    $("slip").setAttribute("aria-hidden", "true");
    $("fortune-live").textContent = "";
    $("after-actions").hidden = true;
    $("cookie-btn").disabled = false;
  }

  function crack() {
    if (stage.dataset.state !== "whole") return;
    $("cookie-btn").disabled = true;

    // The fortune is drawn at the moment of cracking, never chosen by the sender.
    var fortune = draw("fortune-bag", window.FORTUNES);
    var lucky = draw("lucky-bag", window.LUCKY);
    // The text goes in now, still invisible, so the slip is its final size before it moves.
    $("fortune-text").textContent = fortune;
    $("fortune-lucky").textContent = lucky;
    var show = function () {
      stage.dataset.state = "reveal";
      $("slip").removeAttribute("aria-hidden");
      $("fortune-live").textContent = fortune;
      if (!reducedMotion.matches) FX.confetti($("slip").parentNode.getBoundingClientRect());
    };
    track("cookie_cracked", { mode: cookieMode });
    if (navigator.vibrate) navigator.vibrate(reducedMotion.matches ? 0 : [12, 60, 24]);

    var revealAt = 1800;
    if (reducedMotion.matches) {
      revealAt = 0;
      FX.crack();
      FX.rustle(0.8);
      show();
    } else {
      stage.dataset.state = "wobble";
      FX.shake(0.65);
      later(function () { stage.dataset.state = "cracked"; FX.crack(); }, 650);
      later(function () { stage.dataset.state = "split"; FX.rustle(1.3); }, 1150);
      later(show, revealAt);
    }
    // Let the fortune have a moment before offering anything else.
    later(function () { $("after-actions").hidden = false; }, revealAt + 1500);
  }

  $("cookie-btn").addEventListener("click", crack);

  // The slip rattles inside while the pointer is over the cookie.
  $("cookie-btn").addEventListener("pointerenter", function (e) {
    if (e.pointerType === "mouse" && stage.dataset.state === "whole") FX.rattleStart();
  });
  $("cookie-btn").addEventListener("pointerleave", FX.rattleStop);

  var soundToggle = $("sound-toggle");
  function paintSoundToggle() {
    var on = !FX.isMuted();
    soundToggle.setAttribute("aria-pressed", String(on));
    soundToggle.title = on ? "Sound on" : "Sound off";
  }
  soundToggle.addEventListener("click", function () {
    FX.setMuted(!FX.isMuted());
    paintSoundToggle();
  });
  paintSoundToggle();
  $("again-btn").addEventListener("click", function () {
    resetCookie();
    $("cookie-btn").focus();
  });

  // ---------- Send form ----------
  var form = $("send-form");
  var lastGift = null;

  $("message").addEventListener("input", function () {
    $("count").textContent = this.value.length + "/" + MAX_NOTE;
  });
  $("from").addEventListener("input", function () {
    if (this.value.trim()) setFromError(false);
  });

  function setFromError(on) {
    $("from-error").hidden = !on;
    if (on) $("from").setAttribute("aria-invalid", "true");
    else $("from").removeAttribute("aria-invalid");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var from = $("from").value.trim();
    if (!from) {
      setFromError(true);
      $("from").focus();
      return;
    }
    lastGift = {
      f: from,
      t: $("to").value.trim(),
      m: $("message").value.trim() || DEFAULT_NOTE
    };
    track("cookie_sent");
    location.hash = "ready";
  });

  // ---------- Link ready ----------
  function fillReady(gift) {
    var url = giftUrl(gift);
    var shareText = (gift.t ? gift.t + ", " : "") + "I sent you a fortune cookie. Crack it open:";
    $("preview-title").textContent = (gift.t ? "For " + gift.t + ", from " : "From ") + gift.f;
    $("preview-note").textContent = gift.m;
    $("link").value = url;
    $("copy-status").textContent = "";
    $("copy-btn").textContent = "Copy link";
    $("preview-link").href = url;
    $("email-link").href = "mailto:?subject=" + encodeURIComponent("A fortune cookie for you") +
      "&body=" + encodeURIComponent(shareText + "\n\n" + url);
    $("sms-link").href = "sms:?&body=" + encodeURIComponent(shareText + " " + url);
    $("share-btn").hidden = typeof navigator.share !== "function";
    $("share-btn").onclick = function () {
      navigator.share({ title: "A fortune cookie for you", text: shareText, url: url }).catch(function () {});
    };
  }

  $("copy-btn").addEventListener("click", function () {
    var input = $("link");
    var done = function () {
      $("copy-btn").textContent = "Copied";
      $("copy-status").textContent = "Link copied. Paste it anywhere you talk to them.";
      track("link_copied");
    };
    var fallback = function () {
      input.focus();
      input.select();
      try {
        if (document.execCommand("copy")) return done();
      } catch (e) { /* fall through */ }
      $("copy-status").textContent = "Press Ctrl or Cmd + C to copy the link.";
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, fallback);
    } else {
      fallback();
    }
  });
  $("link").addEventListener("focus", function () { this.select(); });

  // ---------- Routing ----------
  function show(name, focusEl) {
    views.forEach(function (v) { $("view-" + v).hidden = v !== name; });
    if (name !== "cookie") { FX.rattleStop(); FX.clearConfetti(); }
    window.scrollTo(0, 0);
    var target = focusEl || $("view-" + name).querySelector("h1");
    if (target && show.hasRun) target.focus({ preventScroll: true });
    show.hasRun = true;
  }

  function setupCookie(mode, gift) {
    cookieMode = mode;
    resetCookie();
    var isGift = mode !== "self";
    $("gift-head").hidden = !isGift;
    if (isGift) {
      // A broken link still gets a cookie, just without a note.
      $("gift-title").textContent = gift && gift.f
        ? gift.f + " sent you a fortune cookie" + (gift.t ? ", " + gift.t : "") + "."
        : "Someone sent you a fortune cookie.";
      $("gift-note").textContent = gift ? gift.m : "";
    }
    $("forward-btn").textContent = isGift ? "Send one forward" : "Send one to a friend";
    document.title = isGift ? "You've got a fortune cookie — Little Fortune" : "Little Fortune";
  }

  function route() {
    var hash = location.hash.replace(/^#/, "");
    if (hash.indexOf("g=") === 0) {
      var gift = decodeGift(hash.slice(2));
      setupCookie("gift", gift);
      show("cookie", $("gift-title"));
      track("gift_opened", { valid: !!gift });
    } else if (hash === "open") {
      setupCookie("self");
      show("cookie", $("cookie-title"));
    } else if (hash === "send") {
      show("send");
    } else if (hash === "ready" && lastGift) {
      fillReady(lastGift);
      show("ready");
    } else if (hash === "ready") {
      location.replace("#send");
    } else {
      document.title = "Little Fortune — crack one open, or send one to a friend";
      show("home");
    }
  }

  window.addEventListener("hashchange", route);
  route();
})();
