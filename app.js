/*!
 * SocialLite 대시보드 — 설정 · 설치 · 실행
 * 차단 자체는 reels-blocker.js(인스타그램 안에서 도는 엔진)가 하고,
 * 이 화면은 그 엔진의 설정을 만들고 설치 파일을 내려 주는 역할을 한다.
 */
(function () {
  "use strict";

  var STORE = "socialite.dashboard.v1";
  var IG = "https://www.instagram.com/";
  var ENGINE = window.SocialiteBlocker;
  var DEFAULTS = Object.assign({}, ENGINE.DEFAULTS);

  var TOGGLES = [
    {
      key: "reelsTab", name: "릴스 탭 제거", tag: "핵심",
      desc: "하단 바·사이드바의 릴스 아이콘과 /reels/ 주소를 없앱니다.",
      icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M10 8.6 15.6 12 10 15.4z"/>'
    },
    {
      key: "feedReels", name: "피드 속 릴스 제거", tag: "핵심",
      desc: "팔로잉 피드에 섞여 들어오는 릴스 게시물과 릴스 트레이를 걷어냅니다.",
      icon: '<rect x="3.5" y="5" width="17" height="14" rx="3.5"/><path d="M7 9.5h6M7 13h9"/>'
    },
    {
      key: "suggested", name: "추천 캐러셀 숨김", tag: "",
      desc: "‘회원님을 위한 추천’ 줄과 추천 릴스 알림을 숨깁니다.",
      icon: '<path d="M12 3.5 14.2 9l5.8.5-4.4 3.8 1.3 5.7L12 15.9 7.1 19l1.3-5.7L4 9.5 9.8 9z"/>'
    },
    {
      key: "ads", name: "광고 숨김", tag: "",
      desc: "Sponsored · 광고 표시가 붙은 게시물을 숨깁니다. (기본 꺼짐)",
      icon: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M17 9.5a3.5 3.5 0 0 1 0 5"/>'
    },
    {
      key: "explore", name: "탐색 피드 정리", tag: "",
      desc: "탐색의 릴스 칸을 지우고 동영상 자동재생을 멈춥니다.",
      icon: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'
    },
    {
      key: "pauseAutoplay", name: "동영상 자동재생 정지", tag: "",
      desc: "피드 동영상이 스스로 재생되지 않습니다. 스토리는 그대로 재생됩니다.",
      icon: '<rect x="4" y="5.5" width="16" height="13" rx="3"/><path d="M10 9.5v5M14 9.5v5"/>'
    },
    {
      key: "allowSingleReel", name: "단일 릴스 안전 모드", tag: "유지",
      desc: "친구가 DM으로 보낸 /reel/CODE/ 한 편은 열어 주되, 다음 릴스 무한 피드는 막습니다.",
      icon: '<path d="M12 3.8 19 7v5.4c0 3.6-2.6 6.2-7 7.8-4.4-1.6-7-4.2-7-7.8V7z"/><path d="m9.2 12 2 2 3.6-4"/>'
    },
    {
      key: "hideProfileReelsTab", name: "프로필 릴스 탭 숨김", tag: "유지",
      desc: "내 프로필 상단의 릴스 탭만 숨깁니다. 사진 그리드는 그대로입니다.",
      icon: '<circle cx="12" cy="8.6" r="3.6"/><path d="M4.8 20c1.2-3.6 4-5.4 7.2-5.4S18 16.4 19.2 20"/>'
    }
  ];

  /* ------------------------------------------------------------- 저장소 */

  function load() {
    var base = { config: Object.assign({}, DEFAULTS), theme: "auto", checks: {}, lastLaunch: 0 };
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      return {
        config: Object.assign(base.config, saved.config || {}),
        theme: saved.theme || "auto",
        checks: saved.checks || {},
        lastLaunch: saved.lastLaunch || 0
      };
    } catch (e) {
      return base;
    }
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();

  /* ------------------------------------------------------------- 도우미 */

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var toastTimer = 0;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function b64url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function unb64url(s) {
    var t = s.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4) t += "=";
    var raw = atob(t);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function activeCount() {
    return TOGGLES.filter(function (t) { return state.config[t.key]; }).length;
  }

  /* --------------------------------------------------------- 화면 그리기 */

  function renderToggles() {
    var host = $("#toggles");
    if (!host) return;
    host.innerHTML = "";
    TOGGLES.forEach(function (t) {
      var on = !!state.config[t.key];
      var row = document.createElement("div");
      row.className = "tg" + (on ? " on" : "");
      row.setAttribute("role", "switch");
      row.setAttribute("aria-checked", on ? "true" : "false");
      row.setAttribute("tabindex", "0");
      row.dataset.key = t.key;
      row.innerHTML =
        '<span class="ic"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
        'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        t.icon + "</svg></span>" +
        '<span class="tx"><span class="nm">' + t.name +
        (t.tag ? ' <span class="tag">' + t.tag + "</span>" : "") + "</span>" +
        '<span class="ds">' + t.desc + "</span></span>" +
        '<span class="sw"></span>';
      row.addEventListener("click", function () { flip(t.key); });
      row.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(t.key); }
      });
      host.appendChild(row);
    });
    refresh();
  }

  function refresh() {
    var n = activeCount();
    var count = $("#rule-count");
    if (count) count.textContent = n + " / " + TOGGLES.length + " 켜짐";

    var live = $("#live");
    if (live) {
      var strong = state.config.reelsTab && state.config.feedReels;
      live.querySelector("span").textContent = strong ? (n === TOGGLES.length ? "완전 차단" : "보호 중") : "일부 해제";
      live.style.opacity = strong ? "1" : "0.6";
    }

    var code = $("#cfg-code");
    if (code) code.textContent = "SL1-" + b64url(JSON.stringify(compact()));

    var checks = $$("[data-check]");
    var done = checks.filter(function (c) { return c.checked; }).length;
    var hint = $("#ready-hint");
    if (hint) hint.textContent = done + " / " + checks.length;

    var note = $("#hero-note");
    if (note) {
      if (state.lastLaunch) {
        note.textContent = "마지막 실행 " + when(state.lastLaunch) + " · 설정은 실행할 때마다 함께 전달됩니다.";
      } else {
        note.textContent = "설치 전이라면, 열리는 건 평소의 인스타그램입니다.";
      }
    }
  }

  function when(ts) {
    var d = new Date(ts);
    var today = new Date();
    var same = d.toDateString() === today.toDateString();
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    return same ? "오늘 " + hh + ":" + mm : (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + hh + ":" + mm;
  }

  function compact() {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k === "debug") return;
      out[k] = state.config[k];
    });
    return out;
  }

  function flip(key) {
    state.config[key] = !state.config[key];
    save();
    var row = $('.tg[data-key="' + key + '"]');
    if (row) {
      row.classList.toggle("on", !!state.config[key]);
      row.setAttribute("aria-checked", state.config[key] ? "true" : "false");
    }
    refresh();
    if (key === "reelsTab" || key === "feedReels") {
      toast(state.config[key] ? "다음 실행부터 적용됩니다" : "잠시 풀어 둡니다");
    }
  }

  /* ------------------------------------------------------------- 실행 */

  function targetUrl(extra) {
    var cfg = Object.assign(compact(), extra || {});
    return IG + "#sl=" + b64url(JSON.stringify(cfg));
  }

  function open(url) {
    var w = null;
    try { w = window.open(url, "_blank", "noopener"); } catch (e) {}
    if (!w) location.href = url;
  }

  function launch() {
    state.lastLaunch = Date.now();
    save();
    refresh();
    open(targetUrl());
    toast("릴스 없는 인스타그램을 엽니다");
  }

  /* ------------------------------------------------------------- 설치 파일 */

  var scriptCache = null;
  function getScript() {
    if (!scriptCache) {
      scriptCache = fetch("socialite.user.js", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("유저스크립트를 불러오지 못했습니다 (" + r.status + ")");
        return r.text();
      });
    }
    return scriptCache.then(function (src) {
      return ENGINE.applyConfigToSource(src, compact());
    });
  }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
      return;
    }
    fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;left:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { toast("복사가 막혔어요. 파일로 저장을 써 주세요"); }
    document.body.removeChild(ta);
  }

  function copyScript() {
    getScript().then(function (src) {
      copyText(src, "유저스크립트를 복사했어요 · 설치 화면에 붙여넣으세요");
    }).catch(function (e) { toast(e.message); });
  }

  function downloadScript() {
    getScript().then(function (src) {
      var blob = new Blob([src], { type: "text/javascript;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "socialite.user.js";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      toast("socialite.user.js 를 저장했어요");
    }).catch(function (e) { toast(e.message); });
  }

  function copyBookmarklet() {
    fetch("bookmarklet.js", { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (txt) {
      copyText(txt.trim(), "북마클릿 코드를 복사했어요 · 북마크 주소에 붙여넣으세요");
    }).catch(function () { toast("북마클릿을 불러오지 못했어요"); });
  }

  /* ------------------------------------------------------------- 단일 릴스 */

  function singleReelUrl(input) {
    var m = /(?:instagram\.com)?\/(?:reel|reels)\/([A-Za-z0-9_-]{5,})/.exec(input || "");
    if (!m) return null;
    return "https://www.instagram.com/reel/" + m[1] + "/#sl=" + b64url(JSON.stringify(Object.assign(compact(), { allowSingleReel: true })));
  }

  function openSingle() {
    var input = $("#reel-link");
    var url = singleReelUrl(input ? input.value : "");
    if (!url) { toast("릴스 링크를 붙여넣어 주세요 (/reel/CODE/)"); return; }
    open(url);
    toast("한 편만 보는 안전 모드로 엽니다");
  }

  /* ------------------------------------------------------------- 설정 코드 */

  function importCode() {
    var raw = window.prompt("대시보드의 설정 코드(SL1-…)를 붙여넣으세요");
    if (!raw) return;
    try {
      var body = raw.trim().replace(/^SL1-/, "");
      var cfg = JSON.parse(unb64url(body));
      if (!cfg || typeof cfg !== "object") throw new Error("형식 오류");
      Object.keys(DEFAULTS).forEach(function (k) {
        if (k in cfg) state.config[k] = cfg[k];
      });
      state.config = ENGINE.normConfig(state.config);
      save();
      renderToggles();
      var sel = $("#redirect");
      if (sel) sel.value = state.config.redirectTo;
      toast("설정을 불러왔어요");
    } catch (e) {
      toast("설정 코드를 읽지 못했어요");
    }
  }

  function resetAll() {
    state.config = Object.assign({}, DEFAULTS);
    save();
    renderToggles();
    var sel = $("#redirect");
    if (sel) sel.value = state.config.redirectTo;
    toast("기본 설정으로 되돌렸어요");
  }

  /* ------------------------------------------------------------- 테마 */

  var THEMES = ["auto", "dark", "light"];
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    var dynamic = document.getElementById("theme-color-dynamic");
    if (state.theme === "auto") {
      /* 시스템 설정을 따를 때는 미디어쿼리 메타 태그만 남긴다 */
      if (dynamic) dynamic.remove();
      return;
    }
    if (!dynamic) {
      dynamic = document.createElement("meta");
      dynamic.id = "theme-color-dynamic";
      dynamic.name = "theme-color";
      document.head.appendChild(dynamic);
    }
    dynamic.content = state.theme === "light" ? "#F5F6F8" : "#08090C";
  }

  function cycleTheme() {
    var i = THEMES.indexOf(state.theme);
    state.theme = THEMES[(i + 1) % THEMES.length];
    save();
    applyTheme();
    toast({ auto: "시스템 설정을 따릅니다", dark: "다크 테마", light: "라이트 테마" }[state.theme]);
  }

  /* ------------------------------------------------------------- 탭 */

  function bindTabs() {
    var tabs = $$(".tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          t.classList.toggle("on", t === tab);
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        ["ios", "orion", "desktop", "shortcuts", "bookmark"].forEach(function (k) {
          var body = $("#tab-" + k);
          if (body) body.classList.toggle("hidden", k !== tab.dataset.tab);
        });
      });
    });
  }

  /* ------------------------------------------------------------- 체크리스트 */

  function bindChecks() {
    $$("[data-check]").forEach(function (box) {
      box.checked = !!state.checks[box.dataset.check];
      box.addEventListener("change", function () {
        state.checks[box.dataset.check] = box.checked;
        save();
        refresh();
      });
    });
  }

  /* ------------------------------------------------------------- PWA */

  function registerSw() {
    var stateEl = $("#sw-state");
    if (!("serviceWorker" in navigator)) {
      if (stateEl) stateEl.textContent = "오프라인 미지원";
      return;
    }
    if (location.protocol === "file:") {
      if (stateEl) stateEl.textContent = "로컬 파일 모드";
      return;
    }
    navigator.serviceWorker.register("sw.js").then(function () {
      if (stateEl) stateEl.textContent = "오프라인 준비됨";
    }).catch(function () {
      if (stateEl) stateEl.textContent = "오프라인 준비 실패";
    });
  }

  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = $("#goto-install");
    if (btn) btn.textContent = "앱으로 설치";
  });

  function onInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt = null;
      return;
    }
    var target = $("#install");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ------------------------------------------------------------- 시작 */

  function init() {
    applyTheme();
    renderToggles();
    bindTabs();
    bindChecks();

    var sel = $("#redirect");
    if (sel) {
      sel.value = state.config.redirectTo;
      sel.addEventListener("change", function () {
        state.config.redirectTo = sel.value;
        save();
        refresh();
        toast("릴스 주소가 " + (sel.value === "/" ? "홈 피드" : "DM") + "로 이동합니다");
      });
    }

    var bind = function (sel2, fn) {
      var el = $(sel2);
      if (el) el.addEventListener("click", fn);
    };
    bind("#launch", launch);
    bind("#goto-install", onInstallClick);
    bind("#copy-script", copyScript);
    bind("#download-script", downloadScript);
    bind("#copy-bookmarklet", copyBookmarklet);
    bind("#copy-launch-url", function () { copyText(targetUrl(), "실행 URL을 복사했어요 · 단축어 ‘URL 열기’에 붙여넣으세요"); });
    bind("#copy-reel-snippet", function () { copyText("https://www.instagram.com/reel/ABC123/", "예시 링크를 복사했어요"); });
    bind("#open-single", openSingle);
    bind("#copy-cfg", function () {
      var code = $("#cfg-code") ? $("#cfg-code").textContent : "";
      if (code && code !== "—") copyText(code, "설정 코드를 복사했어요");
    });
    bind("#import-cfg", importCode);
    bind("#reset", resetAll);
    bind("#theme", cycleTheme);

    $$("[data-copy-script]").forEach(function (b) {
      b.addEventListener("click", copyScript);
    });

    /* 데스크톱 단축키: g = 열기 */
    document.addEventListener("keydown", function (e) {
      if (e.key === "g" && !/input|textarea|select/i.test(document.activeElement.tagName)) launch();
    });

    registerSw();
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
