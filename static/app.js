/* TechAgregator v2 - zegar, czas wzgledny, rozwijanie zrodel, panel kanalow (mobile), pisanie naglowkow sekcji.
   Ruch tylko mechaniczny i wylaczany przy prefers-reduced-motion. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lang = (document.documentElement.getAttribute("lang") || "pl").slice(0, 2);
  if (lang !== "en") lang = "pl";

  // zegar (czas polski)
  var clock = document.querySelector("[data-clock]");
  var fmt = null;
  try { fmt = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Europe/Warsaw" }); } catch (e) {}
  function tick() { if (clock && fmt) clock.textContent = fmt.format(new Date()); }
  if (clock) { tick(); setInterval(tick, 1000); }

  // czas wzgledny (Europe/Warsaw) - aktualizacja co 60 s
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function partsInWarsaw(d) {
    try {
      var f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      var o = {}; f.formatToParts(d).forEach(function (p) { if (p.type !== "literal") o[p.type] = p.value; });
      return { y: +o.year, m: +o.month, d: +o.day, H: +o.hour, M: +o.minute };
    } catch (e) {
      return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), H: d.getHours(), M: d.getMinutes() };
    }
  }
  function isYesterday(loc, nowL) {
    var a = Date.UTC(loc.y, loc.m - 1, loc.d), b = Date.UTC(nowL.y, nowL.m - 1, nowL.d);
    return (b - a) === 86400000;
  }
  function reltime(iso, nowMs) {
    var t0 = Date.parse(iso);
    if (isNaN(t0)) return "";
    var now = nowMs != null ? nowMs : Date.now();
    var mins = Math.max(0, Math.floor((now - t0) / 60000));
    var loc = partsInWarsaw(new Date(t0)), nowL = partsInWarsaw(new Date(now));
    var hm = pad(loc.H) + ":" + pad(loc.M);
    if (mins < 1) return lang === "pl" ? "przed chwilą" : "just now";
    if (mins < 60) return lang === "pl" ? (mins + " min temu") : (mins + " min ago");
    if (mins < 24 * 60) {
      var h = Math.floor(mins / 60), m = mins % 60;
      if (lang === "pl") return m === 0 ? (h + " godz. temu") : (h + " godz. " + m + " min temu");
      return m === 0 ? (h + " h ago") : (h + " h " + m + " min ago");
    }
    if (isYesterday(loc, nowL)) return lang === "pl" ? ("wczoraj, " + hm) : ("yesterday, " + hm);
    return loc.d + "." + pad(loc.m) + ", " + hm;
  }
  function refreshRel() {
    var now = Date.now();
    $$("[data-t0]").forEach(function (el) {
      var iso = el.getAttribute("data-t0");
      if (!iso) return;
      el.textContent = reltime(iso, now);
    });
  }
  refreshRel(); setInterval(refreshRel, 60000);
  window.__reltime = reltime;

  // licznik EVT (odliczanie w gore przy wejsciu)
  $$("[data-count]").forEach(function (el) {
    var n = parseInt(el.getAttribute("data-count"), 10);
    if (reduce || !(n > 1)) return;
    var k = 0, step = Math.max(1, Math.round(n / 18));
    el.textContent = "0";
    var id = setInterval(function () { k = Math.min(n, k + step); el.textContent = String(k); if (k >= n) clearInterval(id); }, 28);
  });

  // rozwijanie listy zrodel w wierszu
  $$(".xpand").forEach(function (b) {
    b.addEventListener("click", function () {
      var box = document.getElementById(b.getAttribute("aria-controls"));
      var open = b.getAttribute("aria-expanded") === "true";
      b.setAttribute("aria-expanded", open ? "false" : "true");
      if (box) box.hidden = open;
    });
  });

  // panel kanalow (mobile)
  var panel = document.getElementById("panel"), scrim = document.querySelector(".scrim"), opener = document.querySelector("[data-panel-open]");
  function setPanel(open) {
    if (!panel) return;
    panel.classList.toggle("open", open);
    if (scrim) scrim.hidden = !open;
    if (opener) opener.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var f = panel.querySelector("a,button,input"); if (f) f.focus(); } else if (opener) opener.focus();
  }
  if (opener) opener.addEventListener("click", function () { setPanel(true); });
  $$("[data-panel-close]").forEach(function (el) { el.addEventListener("click", function () { setPanel(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel && panel.classList.contains("open")) setPanel(false); });

  // pisanie naglowkow sekcji (tylko naglowki sekcji, jednorazowo)
  if (!reduce) {
    $$("[data-type]").forEach(function (el, i) {
      var full = el.textContent.trim();
      if (!full || full.length > 60) return;
      el.setAttribute("aria-label", full);
      el.style.minHeight = el.offsetHeight + "px";
      el.textContent = ""; el.classList.add("typing");
      var k = 0;
      setTimeout(function run() {
        k++; el.textContent = full.slice(0, k);
        if (k < full.length) setTimeout(run, 24); else setTimeout(function () { el.classList.remove("typing"); el.removeAttribute("aria-label"); }, 500);
      }, 120 + i * 90);
    });
  }

  // PRZECZYTANE: stan per przegladarka (localStorage "ta-read-v1"), przeczytane opadaja na dol listy,
  // zakladka "Przeczytane" w panelu. Klucz wydarzenia = stabilny klucz klastra (data-key).
  // Wydarzenie wraca do nieprzeczytanych, gdy po odczycie doszly nowe zrodla (data-n > zapisane n).
  var RD = (function () {
    var KEY = "ta-read-v1", TTL = 7 * 864e5;
    var L = {}; try { L = JSON.parse((document.getElementById("read-cfg") || {}).textContent || "{}") || {}; } catch (e) {}
    function load() {
      try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; }
    }
    var S = load();
    function save() {
      var now = Date.now();
      Object.keys(S).forEach(function (k) { if (!S[k] || !(now - (S[k].t || 0) < TTL)) delete S[k]; });
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    }
    function isRead(key, n) { var e = S[key]; return !!e && (+n || 0) <= (+e.n || 0); }
    function mark(key, n, latest) { if (!key) return; S[key] = { n: +n || 0, l: latest || "", t: Date.now() }; save(); }
    function unmark(key) { if (S[key]) { delete S[key]; save(); } }
    function reload() { S = load(); }
    function count() { return Object.keys(S).length; }
    return { L: L, isRead: isRead, mark: mark, unmark: unmark, reload: reload, count: count };
  })();
  window.__taRead = RD;

  // strona podsumowania = otwarcie wydarzenia
  var sumHead = document.querySelector("[data-read-key]");
  if (sumHead) RD.mark(sumHead.getAttribute("data-read-key"), sumHead.getAttribute("data-n"), sumHead.getAttribute("data-latest"));

  var readRows = document.querySelector("[data-rows]");
  var readView = false;
  try { readView = new URLSearchParams(location.search).get("przeczytane") === "1"; } catch (e) {}
  var readApply = function () {};
  var setReadView = function () {};
  (function () {
    var L = RD.L;
    var live = document.createElement("div"); live.className = "sr-only"; live.setAttribute("aria-live", "polite"); document.body.appendChild(live);
    function say(t) { live.textContent = ""; setTimeout(function () { live.textContent = t || ""; }, 30); }
    function setCounts(n) { $$("[data-read-count]").forEach(function (b) { b.textContent = String(n); }); }
    $$("[data-read-view]").forEach(function (a) { a.hidden = false; });
    if (!readRows) { setCounts(RD.count()); return; }

    var h1 = document.querySelector(".sec-head h1"), h1Txt = h1 ? (h1.getAttribute("aria-label") || h1.textContent).trim() : "";
    var sep = document.createElement("li");
    sep.className = "read-sep"; sep.hidden = true;
    sep.innerHTML = '<span class="read-sep-l"></span><span class="read-sep-h"></span>';
    sep.querySelector(".read-sep-h").textContent = L.sep_hint || "";
    var empty = document.createElement("p");
    empty.className = "empty frame read-empty"; empty.hidden = true; empty.textContent = L.empty || "";
    readRows.parentNode.insertBefore(empty, readRows.nextSibling);

    function kids() { return Array.prototype.filter.call(readRows.children, function (el) { return el !== sep; }); }
    var ordN = 0;
    kids().forEach(function (el) { el.setAttribute("data-ord", String(ordN++)); });
    function ord(el) { return parseFloat(el.getAttribute("data-ord")) || 0; }
    function isEvt(el) { return el.classList && el.classList.contains("evt"); }

    function rowState(li) {
      var read = RD.isRead(li.getAttribute("data-key"), li.getAttribute("data-n"));
      li.classList.toggle("is-read", read);
      var b = li.querySelector("[data-read-toggle]");
      if (b) {
        b.hidden = false;
        b.setAttribute("aria-pressed", read ? "true" : "false");
        b.setAttribute("aria-label", read ? (L.unmark_aria || "") : (L.mark_aria || ""));
        b.title = b.getAttribute("aria-label");
        var l = b.querySelector(".rd-l"); if (l) l.textContent = read ? (L.unmark || "") : (L.mark || "");
      }
      return read;
    }
    function reorder() {
      var all = kids();
      var unread = all.filter(function (el) { return !(isEvt(el) && el.classList.contains("is-read")); });
      var read = all.filter(function (el) { return isEvt(el) && el.classList.contains("is-read"); });
      var by = function (a, b) { return ord(a) - ord(b); };
      unread.sort(by); read.sort(by);
      var seq = unread.concat([sep], read);
      // przenos tylko gdy kolejnosc sie zmienila (bez zbednego przeliczania ukladu)
      var cur = Array.prototype.slice.call(readRows.children), same = cur.length === seq.length;
      for (var i = 0; same && i < seq.length; i++) if (cur[i] !== seq[i]) same = false;
      if (same) return;
      var ae = document.activeElement;
      seq.forEach(function (el) { readRows.appendChild(el); });
      if (ae && ae !== document.activeElement && readRows.contains(ae)) { try { ae.focus({ preventScroll: true }); } catch (e) {} }
    }
    readApply = function () {
      var nRead = 0, nVis = 0, nVisRead = 0;
      $$(".evt", readRows).forEach(function (li) {
        var read = rowState(li);
        if (read) nRead++;
        var fh = li.getAttribute("data-fh") === "1";
        var show = !fh && (!readView || read);
        li.hidden = !show;
        if (show) { nVis++; if (read) nVisRead++; }
      });
      var prevAd = true;   // reklama nie na poczatku, nie dwie z rzedu, nie w sekcji przeczytanych
      var afterSep = false;
      Array.prototype.forEach.call(readRows.children, function (el) {
        if (el === sep) { afterSep = true; return; }
        if (el.classList.contains("ad-row")) {
          var hide = readView || afterSep || prevAd || el.getAttribute("data-fh") === "1";
          el.hidden = hide; if (!hide) prevAd = true;
        } else if (!el.hidden) prevAd = false;
      });
      sep.hidden = readView || nVisRead === 0 || nVisRead === nVis;
      sep.querySelector(".read-sep-l").textContent = (L.sep || "") + " · " + nVisRead;
      setCounts(nRead);
      var lc = document.querySelector("[data-list-count]"); if (lc) lc.textContent = String(nVis);
      empty.hidden = !(readView && nVis === 0);
      var base = document.querySelector(".content > .empty:not(.read-empty)");
      if (base) base.hidden = readView || nVis > 0;
      (function fixH1() {
        if (!h1) return;
        if (h1.classList.contains("typing")) { setTimeout(fixH1, 400); return; }
        var want = readView ? (L.tab || "") : h1Txt;
        if (h1.textContent !== want) h1.textContent = want;
      })();
      $$("[data-read-view]").forEach(function (a) {
        a.classList.toggle("on", readView);
        if (readView) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      if (readView) $$(".channels a[data-kat]").forEach(function (a) { a.classList.remove("on"); a.removeAttribute("aria-current"); });
    };
    setReadView = function (v) { readView = !!v; readApply(); };
    var pending = false;
    function refresh(withOrder) { readApply(); if (withOrder) { reorder(); readApply(); pending = false; } }

    function markLi(li, defer) {
      if (!li || RD.isRead(li.getAttribute("data-key"), li.getAttribute("data-n"))) return;
      RD.mark(li.getAttribute("data-key"), li.getAttribute("data-n"), li.getAttribute("data-latest"));
      rowState(li);
      if (defer) pending = true;   // przeniesienie na dol dopiero po powrocie (lista nie skacze pod palcem)
    }
    readRows.addEventListener("click", function (e) {
      var t = e.target, li = t.closest ? t.closest(".evt") : null; if (!li) return;
      var tg = t.closest("[data-read-toggle]");
      if (tg) {
        e.preventDefault();
        var key = li.getAttribute("data-key");
        if (RD.isRead(key, li.getAttribute("data-n"))) { RD.unmark(key); say(L.restored); }
        else { RD.mark(key, li.getAttribute("data-n"), li.getAttribute("data-latest")); say(L.moved); }
        refresh(true);
        return;
      }
      var xp = t.closest(".xpand");
      if (xp) { if (xp.getAttribute("aria-expanded") === "true") markLi(li, true); return; }   // app.js zmienia stan przed nami
      if (t.closest("a[href]")) markLi(li, true);
    });
    readRows.addEventListener("auxclick", function (e) {
      var li = e.target.closest ? e.target.closest(".evt") : null;
      if (li && e.target.closest("a[href]")) markLi(li, true);
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && pending) refresh(true); });
    addEventListener("pageshow", function (e) { if (e.persisted) { RD.reload(); refresh(true); } });
    addEventListener("storage", function (e) { if (e.key === "ta-read-v1") { RD.reload(); refresh(document.hidden); } });

    // wiersze dopisywane na zywo (sonda): pozycja wg n_sources DESC, latest DESC; zmiana data-n -> ponowna ocena
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        var dirty = false;
        muts.forEach(function (m) {
          if (m.type === "attributes") { dirty = true; return; }
          Array.prototype.forEach.call(m.addedNodes, function (el) {
            if (el.nodeType !== 1 || el === sep || el.hasAttribute("data-ord")) return;
            var n = +el.getAttribute("data-n") || 0, lat = el.getAttribute("data-latest") || "", o = null;
            $$(".evt", readRows).forEach(function (r) {
              if (r === el || !r.hasAttribute("data-ord")) return;
              var rn = +r.getAttribute("data-n") || 0, rl = r.getAttribute("data-latest") || "";
              if ((rn < n || (rn === n && rl < lat)) && (o === null || ord(r) < o)) o = ord(r);
            });
            el.setAttribute("data-ord", String(o === null ? ordN++ : o - 0.5 / (1 + Math.random())));
            dirty = true;
            if (isEvt(el) && !RD.isRead(el.getAttribute("data-key"), el.getAttribute("data-n"))) {
              // nowe nieprzeczytane nie moze utknac w sekcji przeczytanych
              var after = false; Array.prototype.forEach.call(readRows.children, function (c) { if (c === sep) after = true; else if (c === el && after) readRows.insertBefore(el, sep); });
            }
          });
        });
        if (dirty) readApply();
      }).observe(readRows, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-n"] });
    }

    // zakladka "Przeczytane": na serwerze link (?przeczytane=1); w trybie statycznym bez przeladowania
    var isStatic = document.body.getAttribute("data-static") === "1";
    if (isStatic || (!readRows.getAttribute("data-kat") && !readRows.getAttribute("data-q"))) {
      $$("[data-read-view]").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          if (isStatic && window.__taStaticFilter) window.__taStaticFilter("", "", true, !readView);
          else { setReadView(!readView); try { history.replaceState(null, "", readView ? "?przeczytane=1" : location.pathname); } catch (x) {} }
          var p = document.getElementById("panel");
          if (p && p.classList.contains("open")) { p.classList.remove("open"); var sc = document.querySelector(".scrim"); if (sc) sc.hidden = true; }
          window.scrollTo(0, 0);
        });
      });
      if (!isStatic) $$(".channels a[data-kat='']").forEach(function (a) {
        a.addEventListener("click", function (e) { if (readView) { e.preventDefault(); setReadView(false); try { history.replaceState(null, "", location.pathname); } catch (x) {} } });
      });
    }
    refresh(true);
  })();


  // tryb statyczny (GitHub Pages): filtr kanału i wyszukiwanie po stronie klienta
  if (document.body && document.body.getAttribute("data-static") === "1") {
    var rowsRoot = document.querySelector("[data-rows]");
    var form = document.querySelector("form.filter");
    var qInput = document.getElementById("q");
    function params() {
      try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return ""; } }; }
    }
    function applyFilter(kat, q, push, rv) {
      kat = kat || ""; q = (q || "").trim().toLowerCase();
      if (rv !== undefined) readView = !!rv;
      if (readView) kat = "";
      var n = 0;
      if (rowsRoot) {
        rowsRoot.setAttribute("data-kat", kat);
        rowsRoot.setAttribute("data-q", q);
        Array.prototype.forEach.call(rowsRoot.querySelectorAll(".evt"), function (li) {
          var okCat = !kat || li.getAttribute("data-cat") === kat;
          var okQ = !q || (li.getAttribute("data-search") || "").indexOf(q) >= 0;
          var show = okCat && okQ;
          li.setAttribute("data-fh", show ? "" : "1");
          if (show) n++;
        });
        Array.prototype.forEach.call(rowsRoot.querySelectorAll(".ad-row"), function (ad) { ad.setAttribute("data-fh", (kat || q) ? "1" : ""); });
      }
      var lc = document.querySelector("[data-list-count]"); if (lc) lc.textContent = String(n);
      var empty = document.querySelector(".content > .empty:not(.read-empty)");
      if (empty) empty.hidden = n > 0;
      else if (rowsRoot && n === 0) {
        // brak pustego komunikatu - zostawiamy jak jest
      }
      Array.prototype.forEach.call(document.querySelectorAll(".channels a[data-kat]"), function (a) {
        var on = (a.getAttribute("data-kat") || "") === kat;
        a.classList.toggle("on", on);
        if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      });
      if (qInput && qInput.value !== (q || "")) qInput.value = q || "";
      readApply();
      if (push) {
        var base = document.body.getAttribute("data-base") || "";
        var url = base + "/";
        var qs = [];
        if (kat) qs.push("kat=" + encodeURIComponent(kat));
        if (q) qs.push("q=" + encodeURIComponent(q));
        if (readView) qs.push("przeczytane=1");
        if (qs.length) url += "?" + qs.join("&");
        try { history.replaceState(null, "", url); } catch (e) {}
      }
    }
    var P = params();
    window.__taStaticFilter = applyFilter;
    applyFilter(P.get("kat") || "", P.get("q") || "", false);
    Array.prototype.forEach.call(document.querySelectorAll(".channels a[data-kat]"), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        applyFilter(a.getAttribute("data-kat") || "", (qInput && qInput.value) || "", true, false);
        var panel = document.getElementById("panel");
        if (panel && panel.classList.contains("open")) {
          panel.classList.remove("open");
          var scrim = document.querySelector(".scrim"); if (scrim) scrim.hidden = true;
        }
      });
    });
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var kat = (rowsRoot && rowsRoot.getAttribute("data-kat")) || (params().get("kat") || "");
        // aktywny kanał z klasy .on
        var on = document.querySelector(".channels a.on[data-kat]");
        if (on) kat = on.getAttribute("data-kat") || "";
        applyFilter(kat, (qInput && qInput.value) || "", true);
      });
    }
  }
})();

// przelacznik osobowosci AI (warianty wygenerowane z gory, statycznie)
(function () {
  var art = document.querySelector('.ai-article[data-persona]'); if (!art) return;
  function show(p) {
    var v = art.querySelector('.art-var[data-p="' + p + '"]'); if (!v) return false;
    art.querySelectorAll('.art-var').forEach(function (e) { e.hidden = e !== v; });
    art.querySelectorAll('.p-btn').forEach(function (b) { var on = b.dataset.p === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); if (on) art.querySelector('.art-by-name').textContent = b.dataset.name; });
    return true;
  }
  art.querySelectorAll('.p-btn').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.p); try { localStorage.setItem('agg_persona', b.dataset.p); } catch (e) {} });
  });
  try { var s = localStorage.getItem('agg_persona'); if (s) show(s); } catch (e) {}
})();
