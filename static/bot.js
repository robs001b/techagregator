/* BOT - twarz w topbarze (motyw bursztyn). Stany: happy/curious/yawn/sleep/dizzy/think/sad/surprise.
   Ruch: transform/opacity. prefers-reduced-motion = statyczna happy (lub sad gdy OFFLINE). */
(function () {
  "use strict";
  var B = document.getElementById("bot");
  if (!B || !window.requestAnimationFrame) return;
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var reduce = function () { return RM.matches; };
  var ok = B.getAttribute("data-ok") !== "0";
  var mood = ok ? "happy" : "sad";
  var lastAct = Date.now();
  var idleFrom = 30000 + Math.random() * 30000; // 30-60 s
  var clickTimes = [];
  var busy = false;
  var lookX = 0, lookY = 0, tiltX = 0, tiltY = 0;
  var pupils = B.querySelectorAll(".bot-pupil");
  var face = B.querySelector(".bot-face");
  var rafLook = 0, sensorPerm = false, sensorBound = false;

  function setMood(m, force) {
    if (!force && reduce() && m !== "sad" && m !== "happy") m = ok ? "happy" : "sad";
    if (!ok && m !== "dizzy" && m !== "surprise") m = "sad";
    mood = m;
    B.setAttribute("data-mood", m);
    B.classList.toggle("is-sleep", m === "sleep");
    B.classList.toggle("is-yawn", m === "yawn");
    B.classList.toggle("is-dizzy", m === "dizzy");
    B.classList.toggle("is-think", m === "think");
    B.classList.toggle("is-sad", m === "sad");
    B.classList.toggle("is-surprise", m === "surprise");
    B.classList.toggle("is-curious", m === "curious");
  }
  setMood(mood, true);

  function touch() { lastAct = Date.now(); if (mood === "sleep" || mood === "yawn") wake(); }

  function wake() {
    if (!ok) { setMood("sad"); return; }
    if (reduce()) { setMood("happy"); return; }
    busy = true;
    setMood("yawn");
    setTimeout(function () { setMood("happy"); busy = false; }, 700);
  }

  function goSleep() {
    if (!ok || reduce() || busy || document.hidden) return;
    if (Date.now() - lastAct < idleFrom) return;
    busy = true;
    setMood("yawn");
    setTimeout(function () { setMood("sleep"); busy = false; idleFrom = 30000 + Math.random() * 30000; }, 900);
  }

  /* ---------- spojrzenie: mysz / tap / tilt (transform na zrenicach) ---------- */
  function applyLook() {
    rafLook = 0;
    if (reduce() || mood === "sleep" || mood === "yawn" || mood === "dizzy") return;
    var lx = Math.max(-1, Math.min(1, lookX + tiltX));
    var ly = Math.max(-1, Math.min(1, lookY + tiltY));
    var dx = lx * 1.6, dy = ly * 1.2;
    for (var i = 0; i < pupils.length; i++) {
      pupils[i].style.transform = "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px)";
    }
    if (face && (tiltX || tiltY) && !reduce()) {
      face.style.transform = "rotate(" + (tiltX * 6).toFixed(2) + "deg) translateY(" + (tiltY * 1.2).toFixed(2) + "px)";
    }
  }
  function scheduleLook() { if (!rafLook) rafLook = requestAnimationFrame(applyLook); }

  function lookAt(clientX, clientY) {
    if (reduce()) return;
    var r = B.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    lookX = (clientX - cx) / Math.max(r.width, 40);
    lookY = (clientY - cy) / Math.max(r.height, 40);
    if (mood === "happy" && !busy && ok) setMood("curious");
    scheduleLook();
  }

  addEventListener("mousemove", function (e) { touch(); lookAt(e.clientX, e.clientY); }, { passive: true });
  addEventListener("pointerdown", function (e) {
    touch();
    if (e.target.closest && e.target.closest("#bot")) return;
    lookAt(e.clientX, e.clientY);
    if (!busy && ok && !reduce() && mood !== "think") {
      setMood("curious");
      setTimeout(function () { if (mood === "curious" && !busy) setMood("happy"); }, 1200);
    }
  }, { passive: true });

  /* ---------- mruganie ---------- */
  function blink() {
    if (reduce() || !ok || mood === "sleep" || mood === "yawn" || mood === "dizzy" || document.hidden) return;
    B.classList.add("is-blink");
    setTimeout(function () { B.classList.remove("is-blink"); }, 140);
  }
  setInterval(function () {
    if (Math.random() < 0.35) blink();
    goSleep();
  }, 4000);

  /* ---------- reakcje na klik w bota ---------- */
  function bounce(kind) {
    B.classList.remove("bot-bounce", "bot-squash");
    void B.offsetWidth;
    B.classList.add(kind === "squash" ? "bot-squash" : "bot-bounce");
    setTimeout(function () { B.classList.remove("bot-bounce", "bot-squash"); }, 500);
  }
  function reaction() {
    if (!ok) { bounce("squash"); return; }
    if (reduce()) { setMood("happy"); return; }
    busy = true;
    var now = Date.now();
    clickTimes = clickTimes.filter(function (t) { return now - t < 1600; });
    if (!clickTimes.length) clickTimes.push(now); // gdy brak pointerdown (klawiatura)
    if (clickTimes.length >= 3) {
      setMood("dizzy");
      bounce("squash");
      setTimeout(function () { setMood("happy"); busy = false; clickTimes = []; }, 1800);
      return "dizzy";
    }
    var seq = ["surprise", "happy", "curious"];
    var m = seq[clickTimes.length % seq.length];
    setMood(m);
    bounce(clickTimes.length % 2 ? "squash" : "bounce");
    setTimeout(function () { if (mood === m) setMood("happy"); busy = false; }, 900);
    return m;
  }

  function toggleLog() {
    if (window.__sonda && typeof window.__sonda.toggleLog === "function") window.__sonda.toggleLog();
    else {
      var S = document.getElementById("sonda");
      if (S) S.click();
    }
  }

  B.addEventListener("pointerdown", function () {
    // szybsze zbieranie serii (przed click)
    var now = Date.now();
    clickTimes = clickTimes.filter(function (t) { return now - t < 1600; });
    clickTimes.push(now);
  }, { passive: true });
  B.addEventListener("click", function (e) {
    e.preventDefault();
    touch();
    var r = reaction();
    if (r !== "dizzy") toggleLog();
    requestSensorPerm();
  });
  B.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); B.click(); }
  });

  /* ---------- sensory (tilt / shake), iOS permission na pierwszy tap ---------- */
  function requestSensorPerm() {
    if (sensorBound || reduce()) return;
    var DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent;
    var need = (DO && typeof DO.requestPermission === "function") || (DM && typeof DM.requestPermission === "function");
    if (!need) { bindSensors(); return; }
    var p = Promise.resolve("granted");
    if (DM && typeof DM.requestPermission === "function") {
      p = DM.requestPermission().catch(function () { return "denied"; });
    } else if (DO && typeof DO.requestPermission === "function") {
      p = DO.requestPermission().catch(function () { return "denied"; });
    }
    p.then(function (s) { if (s === "granted") { sensorPerm = true; bindSensors(); } });
  }
  var lastShake = 0, lastAcc = null;
  function bindSensors() {
    if (sensorBound) return;
    sensorBound = true;
    addEventListener("deviceorientation", function (e) {
      if (reduce() || document.hidden) return;
      var g = e.gamma, b = e.beta;
      if (g == null || b == null) return;
      tiltX = Math.max(-1, Math.min(1, g / 35));
      tiltY = Math.max(-1, Math.min(1, (b - 45) / 40));
      scheduleLook();
    }, { passive: true });
    addEventListener("devicemotion", function (e) {
      if (reduce() || document.hidden || !ok) return;
      var a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x == null) return;
      if (lastAcc) {
        var dx = a.x - lastAcc.x, dy = a.y - lastAcc.y, dz = (a.z || 0) - (lastAcc.z || 0);
        var mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (mag > 18 && Date.now() - lastShake > 2500) {
          lastShake = Date.now();
          touch();
          busy = true;
          setMood("dizzy");
          bounce("squash");
          setTimeout(function () { setMood("happy"); busy = false; }, 2000);
        }
      }
      lastAcc = { x: a.x, y: a.y, z: a.z || 0 };
    }, { passive: true });
  }

  /* ---------- reakcje na zdarzenia sondy ---------- */
  function onEvent(type) {
    touch();
    if (!ok) return;
    if (reduce()) { setMood("happy"); return; }
    if (type === "summary.start" || type === "analysis") {
      busy = true; setMood("think");
      setTimeout(function () { if (mood === "think") { setMood("happy"); busy = false; } }, 4000);
    } else if (type === "event.new" || type === "reveal") {
      busy = true; setMood("surprise"); bounce("bounce");
      setTimeout(function () { setMood("curious"); }, 400);
      setTimeout(function () { setMood("happy"); busy = false; }, 1400);
    } else if (type === "event.sources") {
      setMood("curious");
      setTimeout(function () { if (mood === "curious") setMood("happy"); }, 1000);
    } else if (type === "summary.done") {
      setMood("happy"); bounce("bounce"); busy = false;
    }
  }

  /* ---------- status ONLINE/OFFLINE z atrybutu (i ewentualnie z zewnątrz) ---------- */
  function setOnline(v) {
    ok = !!v;
    B.setAttribute("data-ok", ok ? "1" : "0");
    B.classList.toggle("bot-offline", !ok);
    var label = ok ? (B.getAttribute("data-label-ok") || "ONLINE") : (B.getAttribute("data-label-bad") || "OFFLINE");
    B.setAttribute("aria-label", label);
    B.setAttribute("title", label);
    setMood(ok ? "happy" : "sad", true);
  }
  if (!ok) setOnline(false);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) touch();
  });

  // desktop / Android: sensory od razu; iOS - po pierwszym tapnieciu (requestPermission)
  if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function")
      && !(window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === "function")) {
    bindSensors();
  }

  window.__bot = {
    react: onEvent,
    setOnline: setOnline,
    lookAt: lookAt,
    touch: touch,
    mood: function () { return mood; },
    el: B,
    force: function (m) { busy = false; setMood(m, true); }
  };
})();
