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


  // tryb statyczny (GitHub Pages): filtr kanału i wyszukiwanie po stronie klienta
  if (document.body && document.body.getAttribute("data-static") === "1") {
    var rowsRoot = document.querySelector("[data-rows]");
    var form = document.querySelector("form.filter");
    var qInput = document.getElementById("q");
    function params() {
      try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return ""; } }; }
    }
    function applyFilter(kat, q, push) {
      kat = kat || ""; q = (q || "").trim().toLowerCase();
      var n = 0;
      if (rowsRoot) {
        rowsRoot.setAttribute("data-kat", kat);
        rowsRoot.setAttribute("data-q", q);
        Array.prototype.forEach.call(rowsRoot.querySelectorAll(".evt"), function (li) {
          var okCat = !kat || li.getAttribute("data-cat") === kat;
          var okQ = !q || (li.getAttribute("data-search") || "").indexOf(q) >= 0;
          var show = okCat && okQ;
          li.hidden = !show;
          if (show) n++;
        });
        Array.prototype.forEach.call(rowsRoot.querySelectorAll(".ad-row"), function (ad) { ad.hidden = !!kat || !!q; });
      }
      var lc = document.querySelector("[data-list-count]"); if (lc) lc.textContent = String(n);
      var empty = document.querySelector(".content .empty");
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
      if (push) {
        var base = document.body.getAttribute("data-base") || "";
        var url = base + "/";
        var qs = [];
        if (kat) qs.push("kat=" + encodeURIComponent(kat));
        if (q) qs.push("q=" + encodeURIComponent(q));
        if (qs.length) url += "?" + qs.join("&");
        try { history.replaceState(null, "", url); } catch (e) {}
      }
    }
    var P = params();
    applyFilter(P.get("kat") || "", P.get("q") || "", false);
    Array.prototype.forEach.call(document.querySelectorAll(".channels a[data-kat]"), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        applyFilter(a.getAttribute("data-kat") || "", (qInput && qInput.value) || "", true);
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
