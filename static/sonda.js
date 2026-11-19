/* SONDA - znacznik zdarzen na zywo (theme v2 "bursztyn").
   Zrodlo: SSE /events/stream (tabela events zapisywana przez pipeline). Reaguje na: event.new, event.sources,
   summary.start, summary.done. Zasady: animacja tylko gdy niesie informacje, lot 0.5 s, najwyzej jeden pokaz na
   MIN_GAP ms (kolejka + laczenie serii), nigdy nie zaslania tekstu/reklam/przyciskow (pozycje liczone z prostokatow
   przeszkod), tylko transform/opacity, prefers-reduced-motion = statycznie (dziennik i tresc nadal sie aktualizuja). */
(function () {
  "use strict";
  var cfgEl = document.getElementById("sonda-cfg"), S = document.getElementById("sonda");
  if (!cfgEl || !S || !window.fetch || !window.Promise) return;
  var cfg = JSON.parse(cfgEl.textContent), L = cfg.i18n || {};
  var LB = document.getElementById("sonda-label"), LOG = document.getElementById("sonda-log"), LIVE = document.getElementById("sonda-live");
  var LIST = LOG.querySelector(".sonda-list"), EMPTY = LOG.querySelector(".sonda-empty");
  var ROWS = document.querySelector("[data-rows]");
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var SZ = 20, GAP = 6, FLY = 500, MIN_GAP = 3200, HOLD = 1600, BURST = 4, SETTLE = 300, SCAN_MAX = 12000, LOG_MAX = 20;
  var reduce = function () { return RM.matches; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fmt = function (s, o) { return String(s || "").replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; }); };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
  function wNom(n) { n = Math.abs(n); if (n === 1) return L.w1; var a = n % 10, b = n % 100; return (a >= 2 && a <= 4 && (b < 12 || b > 14)) ? L.w2 : L.w5; }
  function wGen(n) { return n === 1 ? L.src_gen1 : L.src_gen; }
  // liczba zrodel: PL "2 ŹRÓDŁA" (bez zer wiodacych, poprawna odmiana), EN "SRC 02"
  function srcVal(n) { return L.src_pl ? String(n) : pad2(n); }
  function srcText(n) { return L.src_pl ? n + " " + wNom(n).toUpperCase() : "SRC " + pad2(n); }
  function setSrc(key, n, anim) {
    $$('[data-src-key="' + key + '"]').forEach(function (chip) {
      var r = chip.querySelector(".roll"), w = chip.querySelector(".srcw");
      if (r) { if (anim) roll(r, srcVal(n)); else r.textContent = srcVal(n); }
      if (w) w.textContent = wNom(n).toUpperCase();
    });
  }

  /* ---------- geometria i unikanie kolizji ---------- */
  function R(el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }
  function B(x, y, w, h) { return { l: x, t: y, r: x + w, b: y + h, w: w, h: h }; }
  function hit(a, b, m) { m = m || 0; return a.l < b.r + m && a.r > b.l - m && a.t < b.b + m && a.b > b.t - m; }
  // wszystko, czego SONDA i jej etykieta nie moga zaslonic: tekst, linki, przyciski, reklamy, obrazy, pola
  var OBS = "a,button,input,.chip,.tag,.code,.cat,.evt-title,.tplus,.ad,.lbl,.s-txt,.s-src,.s-meta,.media,.logo,.clock,.status," +
            ".lang,h1,h2,h3,p,.btn,.ai-box,.readout div,.pan li,.mark,.tick em,.empty,.foot p,.back";
  function obstacles(near) {
    var out = [];
    $$(OBS).forEach(function (el) {
      if (el === S || el.closest("#sonda-log") || el.closest(".panel:not(.open)") && innerWidth <= 860) return;
      var r = R(el); if (!r.w || !r.h) return;
      if (!near || hit(r, near, 60)) out.push(r);
    });
    return out;
  }
  function fits(b, obs, avoid) {
    if (b.l < 2 || b.t < 2 || b.r > innerWidth - 2 || b.b > innerHeight - 2) return false;
    for (var i = 0; i < obs.length; i++) if (hit(b, obs[i], 2)) return false;
    for (var j = 0; avoid && j < avoid.length; j++) if (avoid[j] && hit(b, avoid[j], 4)) return false;
    return true;
  }
  // cands: [[x,y],...] w ukladzie viewportu; zwraca pierwsza wolna pozycje albo null
  function choose(cands, w, h, avoid) {
    if (!cands.length) return null;
    var reg = B(Math.min.apply(null, cands.map(function (c) { return c[0]; })), Math.min.apply(null, cands.map(function (c) { return c[1]; })), 0, 0);
    reg.r = Math.max.apply(null, cands.map(function (c) { return c[0] + w; })); reg.b = Math.max.apply(null, cands.map(function (c) { return c[1] + h; }));
    var obs = obstacles(reg);
    for (var i = 0; i < cands.length; i++) { var b = B(cands[i][0], cands[i][1], w, h); if (fits(b, obs, avoid)) return cands[i]; }
    return null;
  }
  function visible(el) { if (!el) return false; var r = R(el); return r.w > 0 && r.b > 60 && r.t < innerHeight - 40; }

  /* ---------- pozycjonowanie z kotwica (sledzi przewijanie) ---------- */
  var sAnchor = null, lAnchor = null, flying = false, dot = null, status = $(".status");
  function setT(el, x, y, anim) {
    el.style.transition = anim && !reduce() ? "transform " + FLY + "ms cubic-bezier(.3,0,.2,1), opacity .2s linear" : "opacity .2s linear";
    el.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function place(el, a, anim) { if (!a || !a.el.isConnected) return; var r = R(a.el); setT(el, r.l + a.dx, r.t + a.dy, anim); }
  function anchorTo(el, x, y) { var r = R(el); return { el: el, dx: x - r.l, dy: y - r.t }; }
  var raf = 0;
  function track() { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; place(S, sAnchor, flying); place(LB, lAnchor, false); }); }
  addEventListener("scroll", track, { passive: true });
  addEventListener("resize", function () { if (!sAnchor || sAnchor.park) park(false); track(); });
  function fly(a) {
    return new Promise(function (res) {
      sAnchor = a; S.classList.remove("parked");
      if (reduce() || document.hidden) { place(S, a, false); return res(); }
      flying = true; S.classList.add("flying"); place(S, a, true);
      setTimeout(function () { flying = false; S.classList.remove("flying"); res(); }, FLY + 30);
    });
  }
  function park(anim) {
    var bot = document.getElementById("bot");
    var base = bot || status || $(".topbar");
    if (!base) return;
    var r = R(base);
    sAnchor = anchorTo(base, r.l + r.w / 2 - SZ / 2, r.t + r.h / 2 - SZ / 2); sAnchor.park = true;
    S.classList.add("parked");
    place(S, sAnchor, anim && !reduce());
  }
  function label(text, cands, avoid) {
    // cands: function(w,h) -> [[x,y],...] wzgledem viewportu; bez wolnego miejsca etykieta sie nie pojawia
    LB.textContent = text; LB.hidden = false; LB.classList.remove("on");
    var w = LB.offsetWidth, h = LB.offsetHeight;
    var p = choose(cands(w, h), w, h, avoid);
    if (!p) { LB.hidden = true; lAnchor = null; return false; }
    lAnchor = anchorTo(cands.anchor || document.body, p[0], p[1]);
    place(LB, lAnchor, false);
    requestAnimationFrame(function () { LB.classList.add("on"); });
    return true;
  }
  function unlabel() { LB.classList.remove("on"); var a = lAnchor; setTimeout(function () { if (lAnchor === a) { LB.hidden = true; lAnchor = null; } }, 220); }
  function parkLabel(text, ms) {
    parkPlace(text);
    return wait(ms || 2400).then(unlabel);
  }
  function labelOr(text, f) {   // etykieta przy celu, a gdy nie ma wolnego miejsca - przy parkingu w gornym pasku
    if (!label(text, f, [R(S)])) parkPlace(text);
  }
  function parkPlace(text) {
    var top = $(".topbar"), clock = $(".clock"), st = status;
    if (!top) return false;
    var f = function (w, h) {
      var T = R(top), c = [];
      if (clock && R(clock).w) { var C = R(clock); c.push([C.l - w - 18, T.t + T.h / 2 - h / 2]); }
      if (st) { var Sx = R(st); c.push([Sx.l - w - 18, T.t + T.h / 2 - h / 2]); }
      c.push([T.r - w - 12, T.b - h / 2], [T.r - w - 12, T.b + 6]);
      return c;
    };
    f.anchor = top;
    return label(text, f, [R(S)]);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- tresc: liczniki, wiersze, przyciski ---------- */
  function roll(el, val) {
    var oldS = (el.textContent || "").trim(), newS = String(val);
    if (oldS === newS) return;
    if (reduce() || document.hidden) { el.textContent = newS; return; }
    var len = Math.max(oldS.length, newS.length), FS = "\u2007";   // rozna liczba cyfr (9 -> 10): wyrownanie spacja cyfrowa
    var o = Array(len - oldS.length + 1).join(FS) + oldS, nn = Array(len - newS.length + 1).join(FS) + newS;
    el.innerHTML = "";
    for (var k = 0; k < len; k++) {
      var d = document.createElement("span"); d.className = "dg";
      d.innerHTML = "<i>" + o[k] + "</i><i>" + nn[k] + "</i>";
      el.appendChild(d);
      if (o[k] !== nn[k]) (function (dd) { requestAnimationFrame(function () { requestAnimationFrame(function () { dd.classList.add("go"); }); }); })(d);
    }
    setTimeout(function () { el.textContent = newS; }, 360);
  }
  function bumpCounts(cat) {
    var c = $("[data-count]"); if (c) roll(c, (parseInt(c.textContent, 10) || 0) + 1);
    var lc = $("[data-list-count]"); if (lc) roll(lc, (parseInt(lc.textContent, 10) || 0) + 1);
    var ch = $('.channels a[data-kat="' + cat + '"] b'); if (ch) roll(ch, (parseInt(ch.textContent, 10) || 0) + 1);
    var all = $('.channels a[data-kat=""] b'); if (all) roll(all, (parseInt(all.textContent, 10) || 0) + 1);
  }
  // wstawianie wiersza bez przesuniecia ukladu: od razu tylko gdy miejsce wstawienia jest poza ekranem
  // (powyzej - kompensacja przewiniecia), karta w tle albo tuz po interakcji uzytkownika; inaczej czeka.
  var pendingRows = [];
  function insertAt(li, ref) {
    var anchorEl = null, before = 0;
    var rows = $$(".evt", ROWS);
    for (var i = 0; i < rows.length; i++) { var rr = R(rows[i]); if (rr.b > 0) { anchorEl = rows[i]; before = rr.t; break; } }
    ROWS.insertBefore(li, ref);
    if (anchorEl && anchorEl !== li) { var d = R(anchorEl).t - before; if (Math.abs(d) > 0.5) scrollBy(0, d); }
    observeReveal(li);
  }
  function safeNow(ref, userInput) {
    if (userInput || document.hidden) return true;
    var y = ref ? R(ref).t : R(ROWS).b;
    return y >= innerHeight || y <= 0;
  }
  function flushRows(userInput) {
    pendingRows = pendingRows.filter(function (p) { if (safeNow(p.ref, userInput)) { insertAt(p.li, p.ref); return false; } return true; });
  }
  addEventListener("scroll", function () { if (pendingRows.length) flushRows(false); }, { passive: true });
  ["pointerdown", "keydown"].forEach(function (t) { addEventListener(t, function () { if (pendingRows.length) flushRows(true); }, true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden && pendingRows.length) flushRows(true); });
  setInterval(function () { if (pendingRows.length) flushRows(false); }, 5000);

  function ensureRow(ev) {
    var el = document.getElementById("evt-" + ev.key);
    if (el) return Promise.resolve({ el: el, inserted: false });
    if (!ROWS) return Promise.resolve(null);
    if ((ROWS.dataset.kat && ev.category && ROWS.dataset.kat !== ev.category) || ROWS.dataset.q) return Promise.resolve(null);
    if (cfg.static) return Promise.resolve(null);
    var base = cfg.base || "";
    return fetch(base + "/fragment/row/" + encodeURIComponent(ev.key) + "?lang=" + cfg.lang, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (html) {
        if (!html || document.getElementById("evt-" + ev.key)) return html ? { el: document.getElementById("evt-" + ev.key), inserted: false } : null;
        var tpl = document.createElement("template"); tpl.innerHTML = html.trim();
        var li = tpl.content.firstElementChild; if (!li) return null;
        li.classList.add("is-new"); li.style.setProperty("--i", 0);
        var n = +li.dataset.n, lat = li.dataset.latest, ref = null;
        $$(".evt", ROWS).some(function (r) { var rn = +r.dataset.n; if (rn < n || (rn === n && r.dataset.latest < lat)) { ref = r; return true; } return false; });
        var emp = $(".content .empty"); if (emp && !$$(".evt", ROWS).length) emp.hidden = true;
        wire(li);
        if (safeNow(ref, false)) insertAt(li, ref); else pendingRows.push({ li: li, ref: ref });
        bumpCounts(li.dataset.cat);
        return { el: li, inserted: true };
      })
      .catch(function () { return null; });
  }
  function wire(li) {   // rozwijanie zrodel w dynamicznie wstawionym wierszu
    var b = li.querySelector(".xpand"); if (!b) return;
    b.addEventListener("click", function () {
      var box = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", open ? "false" : "true"); if (box) box.hidden = open;
    });
  }
  var revealIO = window.IntersectionObserver ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && e.intersectionRatio > 0.6) { revealIO.unobserve(e.target); if (e.target.dataset.reveal) { delete e.target.dataset.reveal; enqueue({ type: "reveal", key: e.target.dataset.key, n_sources: +e.target.dataset.n, _local: true }); } }
    });
  }, { threshold: [0.6] }) : null;
  function observeReveal(li) { if (!revealIO) return; li.dataset.reveal = "1"; revealIO.observe(li); }
  function refreshBtn(key) {
    if (cfg.static) return Promise.resolve();
    var base = cfg.base || "";
    return fetch(base + "/fragment/row/" + encodeURIComponent(key) + "?lang=" + cfg.lang).then(function (r) { return r.ok ? r.text() : null; }).then(function (html) {
      if (!html) return;
      var tpl = document.createElement("template"); tpl.innerHTML = html.trim();
      var nb = tpl.content.querySelector("[data-btn]"), row = document.getElementById("evt-" + key), ob = row && row.querySelector("[data-btn]");
      if (nb && ob) ob.replaceWith(nb);
    }).catch(function () {});
  }
  function trace(row) {
    var w = row.offsetWidth, h = row.offsetHeight, c = 12;
    var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    svg.setAttribute("class", "trace"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    p.setAttribute("pathLength", "1");
    p.setAttribute("d", "M" + c + " .75H" + (w - .75) + "V" + (h - c) + "L" + (w - c) + " " + (h - .75) + "H.75V" + c + "Z");
    svg.appendChild(p); row.appendChild(svg);
    setTimeout(function () { svg.classList.add("out"); }, HOLD + 300);
    setTimeout(function () { svg.remove(); }, HOLD + 700);
  }

  /* ---------- pokazy (jeden naraz, najwyzej co MIN_GAP) ---------- */
  function showNew(ev) {
    var text = L.new + " · " + srcText(ev.n_sources || 0);
    return (ev.type === "reveal" ? Promise.resolve({ el: document.getElementById("evt-" + ev.key) }) : ensureRow(ev)).then(function (res) {
      var row = res && res.el;
      if (reduce() && row && row.isConnected && visible(row)) { if (row.dataset.reveal && revealIO) { revealIO.unobserve(row); delete row.dataset.reveal; } trace(row); return parkLabel(text + " · " + ev.code, 2200); }
      if (!row || !row.isConnected || !visible(row) || pendingRows.some(function (p) { return p.li === row; })) {
        if (res && res.inserted && revealIO) return parkLabel(text + " · " + ev.code, 2200);   // pokaz przy wiersza, gdy wjedzie w ekran
        return parkLabel(text + " · " + ev.code, 2200);
      }
      if (row.dataset.reveal && revealIO) { revealIO.unobserve(row); delete row.dataset.reveal; }
      var r = R(row);
      var p = choose([[r.l - GAP - SZ, r.t + 14], [r.r + GAP, r.t + 14], [r.l + 26, r.t - SZ / 2], [r.r - 60, r.t - SZ / 2], [r.l + 26, r.b - SZ / 2]], SZ, SZ);
      if (!p) return parkLabel(text + " · " + ev.code, 2200);
      return fly(anchorTo(row, p[0], p[1])).then(function () {
        trace(row);
        var f = function (w, h) { var q = R(row); return [[q.r - w - 26, q.t - h / 2], [q.l + 52, q.t - h / 2], [q.r - w - 26, q.b - h / 2], [q.l + 52, q.b - h / 2]]; };
        f.anchor = row;
        labelOr(text, f);
        return wait(HOLD).then(unlabel);
      });
    });
  }
  function showSources(ev) {
    var chips = $$('[data-src-key="' + ev.key + '"] .roll');
    var upd = function () { setSrc(ev.key, ev["new"], true); };
    var row = document.getElementById("evt-" + ev.key); if (row) row.dataset.n = ev["new"];
    var chip = chips.map(function (e) { return e.closest(".chip"); }).filter(visible)[0];
    var d = (ev["new"] - ev.old), txt = (d > 0 ? "+" : "") + d + " " + wNom(d).toUpperCase();
    if (!chip || reduce()) { upd(); return parkLabel(ev.code + " " + txt, 2200); }
    var C = R(chip), x = chip.parentNode.querySelector(".xpand"), X = x ? R(x) : C;
    var p = choose([[C.l - GAP - SZ, C.t + C.h / 2 - SZ / 2], [X.r + GAP, C.t + C.h / 2 - SZ / 2], [C.l + C.w / 2 - SZ / 2, C.b + GAP], [C.l + C.w / 2 - SZ / 2, C.t - GAP - SZ]], SZ, SZ);
    if (!p) { upd(); return parkLabel(ev.code + " " + txt, 2200); }
    return fly(anchorTo(chip, p[0], p[1])).then(function () {
      upd();
      var f = function (w, h) { var q = R(chip), xx = x ? R(x) : q, s = R(S); return [[Math.max(xx.r, s.r) + 8, q.t + q.h / 2 - h / 2], [q.l, q.b + 6], [q.l, q.t - h - 6]]; };
      f.anchor = chip;
      labelOr(txt, f);
      return wait(HOLD).then(unlabel);
    });
  }
  var analysing = {};   // key -> {btn, done:function}
  function showStart(ev) {
    var row = document.getElementById("evt-" + ev.key), btn = row && row.querySelector("[data-btn]");
    var n = ev.n_ai || 0, text = fmt(L.analysis, { n: n, w: wGen(n) });
    if (btn) btn.classList.add("analyzing");
    var st = { key: ev.key };
    var finished = new Promise(function (res) { st.done = res; });
    analysing[ev.key] = st;
    setTimeout(function () { if (btn) btn.classList.remove("analyzing"); }, 60000);   // zabezpieczenie, gdy zdarzenie konca nie dotrze
    if (!btn || !visible(btn) || reduce()) return parkLabel(text + " · " + ev.code, 2600);
    var Bx = R(btn);
    var p = choose([[Bx.l - GAP - SZ, Bx.t + Bx.h / 2 - SZ / 2], [Bx.r - SZ, Bx.t - GAP - SZ], [Bx.r + GAP, Bx.t + Bx.h / 2 - SZ / 2], [Bx.l + Bx.w / 2 - SZ / 2, Bx.b + GAP]], SZ, SZ);
    if (!p) return parkLabel(text + " · " + ev.code, 2600);
    return fly(anchorTo(btn, p[0], p[1])).then(function () {
      var f = function (w, h) { var q = R(btn), s = R(S); return [[q.r - w, q.t - h - 8], [s.l - w - 8, q.t + q.h / 2 - h / 2], [q.r - w, q.b + 8], [q.l, q.t - h - 8]]; };
      f.anchor = btn;
      labelOr(text, f);
      return Promise.race([finished, wait(SCAN_MAX)]).then(function (ok) {
        if (ok && ok.status === "ok") { LB.textContent = L.ready; return wait(700); }
      }).then(unlabel);
    });
  }
  function onDone(ev) {
    var row = document.getElementById("evt-" + ev.key), btn = row && row.querySelector("[data-btn]");
    if (btn) btn.classList.remove("analyzing");
    var st = analysing[ev.key]; if (st) { st.done(ev); delete analysing[ev.key]; }
    queue = queue.filter(function (q) { return !(q.type === "summary.start" && q.key === ev.key); });   // start juz nieaktualny
    if (row && ev.status === "ok") refreshBtn(ev.key);
  }
  function applyStatic(ev) {   // tresc bez animacji (seria zdarzen / tlo)
    if (ev.type === "event.new") return ensureRow(ev);
    if (ev.type === "event.sources") setSrc(ev.key, ev["new"], false);
    if (ev.type === "summary.start") { var r = document.getElementById("evt-" + ev.key), b = r && r.querySelector("[data-btn]"); if (b) b.classList.add("analyzing"); }
  }

  var queue = [], busy = false, lastShow = 0, timer = 0;
  var burstLive = null;   // zbiorczy komunikat w kolejce lub na ekranie - kolejne zdarzenia serii dopisuja sie do niego
  function burstText(n) { return fmt(L.burst, { n: n, w: (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? L.ev2 : L.ev5 }); }
  function enqueue(ev) {
    if (ev.type === "event.new" || ev.type === "event.sources") {
      var qb = queue.filter(function (q) { return q.type === "burst"; })[0] || burstLive;
      if (qb) { applyStatic(ev); qb.n++; if (qb === burstLive && LB.dataset.burst === "1") LB.textContent = burstText(qb.n); return; }
    }
    // laczenie: kolejne zmiany tego samego wydarzenia -> jeden pokaz z ostatnia wartoscia
    for (var i = 0; i < queue.length; i++) {
      var q = queue[i];
      if (q.key === ev.key && ev.type === "event.sources" && (q.type === "event.new" || q.type === "reveal")) { q.n_sources = ev["new"]; return settle(); }
      if (q.key === ev.key && ev.type === "event.sources" && q.type === "event.sources") { q["new"] = ev["new"]; return settle(); }
      if (q.key === ev.key && ev.type === q.type && ev.type !== "summary.start") return settle();
    }
    queue.push(ev);
    // seria (np. przebieg klastrowania): tresc od razu, jeden zbiorczy komunikat przy parkingu
    var nonSum = queue.filter(function (q) { return q.type !== "summary.start"; });
    if (nonSum.length >= BURST) {
      queue = queue.filter(function (q) { return q.type === "summary.start"; });
      nonSum.forEach(applyStatic);
      queue.unshift({ type: "burst", n: nonSum.length });
    }
    settle();
  }
  var settleT = 0;
  function settle() {   // krotkie okno zbierania: zdarzenia z jednej serii trafiaja do kolejki razem i moga sie polaczyc
    clearTimeout(settleT); settleT = setTimeout(pump, SETTLE);
  }
  function pump() {
    if (busy || !queue.length) return;
    var w = lastShow + MIN_GAP - Date.now();
    if (w > 0) { if (!timer) timer = setTimeout(function () { timer = 0; pump(); }, w); return; }
    busy = true; lastShow = Date.now();
    var ev = queue.shift(), run;
    if (ev.type === "event.new" || ev.type === "reveal") run = showNew(ev);
    else if (ev.type === "event.sources") run = showSources(ev);
    else if (ev.type === "summary.start") run = showStart(ev);
    else if (ev.type === "burst") {
      burstLive = ev;
      run = Promise.resolve().then(function () { var pr = parkLabel(burstText(ev.n), 2600); LB.dataset.burst = "1"; return pr; })
        .then(function () { delete LB.dataset.burst; setTimeout(function () { if (burstLive === ev) burstLive = null; }, 1500); });
    }
    else run = Promise.resolve();
    run.catch(function () {}).then(function () {
      busy = false;
      if (!queue.length) { park(true); }
      pump();
    });
  }

  /* ---------- dziennik + czytnik ekranu ---------- */
  var logItems = [], logLoaded = false;
  function msg(ev) {
    var n;
    switch (ev.type) {
      case "event.new": return fmt(L.log_new, { n: L.src_pl ? (ev.n_sources || 0) + " " + wNom(ev.n_sources || 0) : "SRC " + pad2(ev.n_sources || 0) });
      case "event.sources": n = ev["new"] - ev.old; return fmt(L.log_src, { d: (n > 0 ? "+" : "") + n, w: wNom(n) });
      case "summary.start": n = ev.n_ai || 0; return fmt(L.log_start, { n: n, w: n === 1 ? L.wg1 : L.wg });
      case "summary.done": return L["log_done_" + ev.status] || L.log_done_error;
    }
    return ev.type;
  }
  function renderLog() {
    LIST.innerHTML = "";
    logItems.slice(-LOG_MAX).reverse().forEach(function (ev) {
      var li = document.createElement("li");
      var t = document.createElement("time"); t.className = "tplus";
      if (ev.ts) { t.setAttribute("datetime", ev.ts); t.setAttribute("data-t0", ev.ts); t.setAttribute("title", ev.ts);
        t.textContent = (window.__reltime ? window.__reltime(ev.ts) : (ev.hm || "")); }
      else { t.textContent = ev.hm || ""; }
      var b = document.createElement("b"); b.textContent = ev.code || "";
      var s = document.createElement("span"); s.textContent = msg(ev);
      if (ev.test) { var x = document.createElement("span"); x.className = "t"; x.textContent = " " + L.test; s.appendChild(x); }
      li.appendChild(t); li.appendChild(b); li.appendChild(s); LIST.appendChild(li);
    });
    EMPTY.hidden = logItems.length > 0;
  }
  function addLog(ev) {
    if (logItems.some(function (e) { return e.id === ev.id; })) return;
    logItems.push(ev); if (logItems.length > LOG_MAX) logItems.shift();
    if (!LOG.hidden) renderLog();
  }
  var liveT = 0, liveBuf = [];
  function announce(text) {   // grzecznie i zbiorczo: najwyzej jeden komunikat na 2 s
    liveBuf.push(text);
    if (liveT) return;
    liveT = setTimeout(function () { LIVE.textContent = liveBuf.length > 3 ? liveBuf.length + " · " + liveBuf.slice(-1)[0] : liveBuf.join(". "); liveBuf = []; liveT = 0; }, 2000);
  }
  var opener = null;
  function openLog() {
    opener = document.activeElement;
    var go = function () { renderLog(); LOG.hidden = false; S.setAttribute("aria-expanded", "true"); var bot = document.getElementById("bot"); if (bot) bot.setAttribute("aria-expanded", "true"); requestAnimationFrame(function () { LOG.classList.add("on"); }); var x = $("[data-sonda-close]", LOG); if (x) x.focus(); };
    if (logLoaded) return go();
    var eu = cfg.eventsUrl || ((cfg.base || "") + "/events/recent?n=" + LOG_MAX);
    fetch(eu, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (arr) {
      if (arr && arr.events) arr = arr.events;
      arr.forEach(function (e) { if (!logItems.some(function (x) { return x.id === e.id; })) logItems.push(e); });
      logItems.sort(function (a, b) { return a.id - b.id; }); logItems = logItems.slice(-LOG_MAX); logLoaded = true;
    }).catch(function () {}).then(go);
  }
  function closeLog() {
    LOG.classList.remove("on"); S.setAttribute("aria-expanded", "false"); var bot = document.getElementById("bot"); if (bot) bot.setAttribute("aria-expanded", "false");
    setTimeout(function () { LOG.hidden = true; }, reduce() ? 0 : 200);
    (opener && opener.focus ? opener : S).focus();
  }
  S.addEventListener("click", function () { if (LOG.hidden) openLog(); else closeLog(); });
  function toggleLog() { if (LOG.hidden) openLog(); else closeLog(); }
  $$("[data-sonda-close]", LOG).forEach(function (b) { b.addEventListener("click", closeLog); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !LOG.hidden) closeLog(); });
  document.addEventListener("click", function (e) { var bot = document.getElementById("bot"); if (!LOG.hidden && !LOG.contains(e.target) && e.target !== S && !S.contains(e.target) && !(bot && (e.target === bot || bot.contains(e.target)))) closeLog(); });

  /* ---------- SSE z wznawianiem (Last-Event-ID, backoff) ---------- */
  var lastId = cfg.last || 0, es = null, backoff = 2000;
  function handle(ev) {
    addLog(ev);
    announce((ev.code ? ev.code + " " : "") + msg(ev));
    if (window.__bot && window.__bot.react) try { window.__bot.react(ev.type); } catch (e) {}
    if (ev.type === "summary.done") return onDone(ev);
    enqueue(ev);
  }
  function onMsg(m) {
    var ev; try { ev = JSON.parse(m.data); } catch (e) { return; }
    if (!ev.id || ev.id <= lastId) return;
    lastId = ev.id; handle(ev);
  }
  var TYPES = ["event.new", "event.sources", "summary.start", "summary.done"];
  /* Strumien przez fetch POST (cfg.post, tryb testowy): quick tunnel Cloudflare buforuje odpowiedzi GET do konca,
     wiec EventSource dostalby zdarzenia dopiero po zamknieciu polaczenia. Ten sam format SSE, recznie parsowany. */
  var ctl = null;
  function connectPost() {
    if (ctl) try { ctl.abort(); } catch (e) {}
    ctl = window.AbortController ? new AbortController() : null;
    var buf = "", dec = new TextDecoder(), ok = false;
    function block(b) {
      var type = "message", data = [];
      b.split("\n").forEach(function (ln) {
        if (ln.indexOf("event:") === 0) type = ln.slice(6).trim();
        else if (ln.indexOf("data:") === 0) data.push(ln.slice(5).replace(/^ /, ""));
      });
      if (data.length && TYPES.indexOf(type) >= 0) onMsg({ data: data.join("\n") });
    }
    function again(ms) { setTimeout(connectPost, ms); }
    fetch((cfg.base || "") + "/events/stream?since=" + lastId, { method: "POST", cache: "no-store", credentials: "same-origin",
      headers: { "Accept": "text/event-stream" }, signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok || !r.body) throw new Error("http " + r.status);
      ok = true; backoff = 2000;
      var rd = r.body.getReader();
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) return again(3000);                     // serwer zamyka strumien po SSE_MAX_S - wznawiamy od lastId
          buf += dec.decode(x.value, { stream: true }).replace(/\r\n?/g, "\n");
          var i;
          while ((i = buf.indexOf("\n\n")) >= 0) { block(buf.slice(0, i)); buf = buf.slice(i + 2); }
          return pump();
        });
      }
      return pump();
    }).catch(function (e) {
      if (e && e.name === "AbortError") return;
      again(ok ? 3000 : backoff); if (!ok) backoff = Math.min(backoff * 2, 30000);
    });
  }
  function connect() {
    if (cfg.post && window.ReadableStream && window.TextDecoder) return connectPost();
    if (es) try { es.close(); } catch (e) {}
    es = new EventSource((cfg.base || "") + "/events/stream?since=" + lastId);
    TYPES.forEach(function (t) { es.addEventListener(t, onMsg); });
    es.onopen = function () { backoff = 2000; };
    es.onerror = function () {   // przegladarka sama wznawia (retry 3 s); gdy zamknie polaczenie na stale - my wznawiamy
      if (es.readyState === 2) { setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); }
    };
  }
  /* ---------- tryb statyczny (GitHub Pages): poll events.json co 60 s ---------- */
  function connectStatic() {
    var url = cfg.eventsUrl || ((cfg.base || "") + "/events.json");
    function tick() {
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          var arr = data.events || data;
          if (!Array.isArray(arr)) return;
          arr.forEach(function (ev) {
            if (!ev.id || ev.id <= lastId) return;
            lastId = ev.id; handle(ev);
          });
        }).catch(function () {});
    }
    tick();
    setInterval(tick, 60000);
  }

  S.hidden = false;
  park(false);
  /* Parking liczony przed zaladowaniem fontow trafial obok kropki statusu (przesuniecie tekstu po podmianie fontu
     nie wywoluje scroll/resize) - ponowne zakotwiczenie po fontach, po load i przy kazdej zmianie rozmiaru statusu. */
  function repark() { if (!sAnchor || sAnchor.park) park(false); else track(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(repark);
  addEventListener("load", repark);
  if (window.ResizeObserver && status) new ResizeObserver(repark).observe(status);
  var start = function () { setTimeout(cfg.static ? connectStatic : connect, 300); };
  if (document.readyState === "complete") start(); else addEventListener("load", start);
  window.__sonda = { enqueue: enqueue, toggleLog: toggleLog, openLog: openLog, closeLog: closeLog, state: function () { return { queue: queue.length, busy: busy, flying: flying, labelOn: !LB.hidden && LB.classList.contains("on"), lastId: lastId, pending: pendingRows.length }; } };
})();
