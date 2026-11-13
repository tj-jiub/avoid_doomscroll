/*!
 * SocialLite Reels Blocker — core engine
 * 인스타그램 웹(instagram.com)에서 릴스(숏폼 무한 피드)만 정확히 도려내고
 * DM · 팔로잉 피드 · 스토리 · 프로필 · 탐색의 일반 기능은 그대로 둔다.
 *
 * 설계 원칙
 *  1) 인스타그램이 매일 바꾸는 해시 클래스(x1abc...)는 절대 쓰지 않는다.
 *     href · aria-label · role · 텍스트처럼 오래 유지되는 신호만 쓴다.
 *  2) React가 관리하는 노드를 DOM에서 삭제하지 않는다. `data-sl-hidden` 속성 + CSS로 숨긴다.
 *     (삭제하면 React 재조정이 깨져 DM 입력창·스토리 뷰어가 멈출 수 있다.)
 *  3) 라우팅은 3중으로 막는다: 클릭 가로채기 → pushState 패치 → 0.8초 폴링.
 *  4) 친구가 DM으로 보낸 단일 릴스(/reel/CODE/)는 '안전 모드'로 열어 준다.
 *
 * 사용
 *   var ctrl = SocialiteBlocker.start({ reelsTab: true, feedReels: true });
 *   ctrl.update({ suggested: false });   // 실시간 반영
 *   ctrl.sweep();  ctrl.status();  ctrl.stop();
 *
 * 의존성 없음. ES5 문법만 사용(구형 사파리/북마클릿 호환).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SocialiteBlocker = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var STYLE_ID = "sl-style";
  var HIDDEN = "data-sl-hidden";

  var DEFAULTS = {
    reelsTab: true,          // 하단 바 / 사이드바의 릴스 탭 제거
    feedReels: true,         // 메인 피드에 섞여 들어오는 릴스 유닛 제거
    suggested: true,         // '회원님을 위한 추천' 캐러셀 제거
    ads: false,              // '광고/Sponsored' 게시물 제거
    explore: true,           // 탐색 피드의 릴스 셀 제거 + 자동재생 정지
    pauseAutoplay: false,    // 피드 동영상 자동재생 정지
    allowSingleReel: true,   // DM으로 받은 단일 릴스는 안전 모드로 허용
    hideProfileReelsTab: true, // 프로필의 '릴스' 탭 제거
    redirectTo: "/",         // 막힌 주소가 갈 곳
    debug: false
  };

  /* 인스타그램 UI 문구(한국어/영어) — 정확 일치로만 매칭한다. */
  var LABELS = {
    reels: ["Reels", "릴스", "Reels 탭"],
    suggested: ["Suggested for you", "회원님을 위한 추천", "Suggested posts", "추천 게시물", "Suggested Reels"],
    ads: ["Sponsored", "광고", "후원"],
    next: ["Next", "다음"],
    prev: ["Previous", "이전"]
  };

  /* ---------------------------------------------------------------- util */

  function normPath(p) {
    if (!p) return "/";
    p = String(p);
    var m = /^https?:\/\/[^\/]+(\/[^?#]*)?/i.exec(p);
    if (m) p = m[1] || "/";
    p = p.split("#")[0].split("?")[0];
    if (p.charAt(0) !== "/") p = "/" + p;
    return p;
  }

  function trimSlash(p) {
    return p.length > 1 && p.charAt(p.length - 1) === "/" ? p.slice(0, -1) : p;
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) {
          target[k] = src[k];
        }
      }
    }
    return target;
  }

  function normConfig(cfg) {
    var out = assign({}, DEFAULTS, cfg || {});
    var to = String(out.redirectTo || "/");
    if (to.charAt(0) !== "/" || /^\/(reels|reel)(\/|$)/.test(to)) to = "/";
    if (!/^\/($|direct|explore)/.test(to)) to = "/";
    out.redirectTo = to;
    if (out.blockExplore === undefined) out.blockExplore = false;
    return out;
  }

  function routeInfo(pathname) {
    var p = trimSlash(normPath(pathname));
    if (p === "/reels" || /^\/reels\//.test(p)) return "reels";
    if (/^\/reel\/[^\/]+$/.test(p)) return "reel";
    if (p === "/direct" || /^\/direct\//.test(p)) return "direct";
    if (p === "/explore" || /^\/explore\//.test(p)) return "explore";
    if (p === "/stories" || /^\/stories\//.test(p)) return "stories";
    if (/^\/accounts\//.test(p) || p === "/emails" || p === "/session") return "accounts";
    var pr = /^\/([A-Za-z0-9._]+)\/reels$/.exec(p);
    if (pr) return "profile-reels";
    if (p === "/") return "home";
    if (/^\/[A-Za-z0-9._]+$/.test(p)) return "profile";
    if (/^\/p\/[^\/]+$/.test(p) || /^\/tv\/[^\/]+$/.test(p)) return "post";
    return "other";
  }

  /**
   * 릴스 관련 주소 판정. 순수 함수라 테스트에서 그대로 검증한다.
   * @returns {{action:"allow"|"redirect", to?:string, reason:string, kind:string}}
   */
  function redirectFor(pathname, cfg) {
    var c = normConfig(cfg);
    var p = trimSlash(normPath(pathname));
    var kind = routeInfo(p);

    if (kind === "reels") {
      return { action: "redirect", to: c.redirectTo, reason: "reels-feed", kind: kind };
    }
    if (kind === "reel") {
      if (c.allowSingleReel) return { action: "allow", reason: "single-reel-safe", kind: kind };
      return { action: "redirect", to: c.redirectTo, reason: "single-reel-blocked", kind: kind };
    }
    if (kind === "profile-reels") {
      if (!c.hideProfileReelsTab) return { action: "allow", reason: "profile-reels-off", kind: kind };
      var user = /^\/([A-Za-z0-9._]+)\/reels$/.exec(p);
      return {
        action: "redirect",
        to: (user ? "/" + user[1] + "/" : "/"),
        reason: "profile-reels-tab",
        kind: kind
      };
    }
    if (kind === "explore" && c.blockExplore) {
      return { action: "redirect", to: c.redirectTo, reason: "explore-blocked", kind: kind };
    }
    return { action: "allow", reason: "kept", kind: kind };
  }

  /* ------------------------------------------------------------- CSS 생성 */

  function buildCss(cfg) {
    var c = normConfig(cfg);
    var out = [];

    function rule(sel, decl) {
      out.push(sel + "{" + (decl || "display:none!important") + "}");
    }

    /* 숨김 표식 — JS가 붙인 것도, 정적 CSS가 붙인 것도 같은 방식으로 숨긴다. */
    rule("[" + HIDDEN + "]", "display:none!important;pointer-events:none!important");

    if (c.reelsTab) {
      /* 하단 내비게이션 바 · 데스크톱 사이드바 · 상단 탭의 릴스 항목 */
      rule('a[href="/reels/"],a[href="/reels"]');
      rule('a:has(> svg[aria-label="Reels"]),a:has(> svg[aria-label="릴스"])');
      rule('svg[aria-label="Reels"],svg[aria-label="릴스"]');
      rule('[role="tab"][aria-label="Reels"],[role="tab"][aria-label="릴스"]');
      rule('[role="tablist"] a[href^="/reels/"]');
      rule('[role="navigation"] a[href^="/reels/"]');
      rule('header a[href^="/reels/"],nav a[href^="/reels/"]');
    }

    if (c.hideProfileReelsTab) {
      /* 프로필 상단의 '릴스' 탭 (그리드 자체는 건드리지 않는다) */
      rule('a[href$="/reels/"]:not([href="/reels/"]):not([href="/reels"])');
    }

    if (c.feedReels) {
      /* 피드에 섞여 들어온 릴스 게시물 — /reel/ 링크를 품은 article만 */
      rule('html:not(.sl-route-direct):not(.sl-single-reel) main article:has(a[href^="/reel/"])');
      rule('html:not(.sl-route-direct):not(.sl-single-reel) main article:has(svg[aria-label="Reels"])');
    }

    if (c.explore) {
      /* 탐색 피드의 릴스 셀 */
      rule('html.sl-route-explore main a[href^="/reel/"]');
    }

    if (c.allowSingleReel) {
      /* 안전 모드: 단일 릴스 한 편만 — 다음/이전 화살표로 무한 피드에 빠지지 않게 */
      var s = "html.sl-single-reel ";
      rule(s + '[aria-label="Next"],' + s + '[aria-label="다음"]');
      rule(s + '[aria-label="Previous"],' + s + '[aria-label="이전"]');
      rule(s + '[aria-label="Next reel"],' + s + '[aria-label="다음 릴스"]');
    }

    return out.join("\n");
  }

  /* ------------------------------------------------------------ 엔진 본체 */

  function start(userConfig, options) {
    var opts = options || {};
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc) throw new Error("SocialiteBlocker: document is required");
    var win = doc.defaultView || (typeof window !== "undefined" ? window : null);
    var cfg = normConfig(userConfig);
    var styleEl = null;
    var observer = null;
    var running = false;
    var pending = false;
    var lastSweep = 0;
    var lastTextSweep = 0;
    var timers = [];
    var banner = null;
    var redirectLog = {};
    var stat = {
      sweeps: 0,
      hidden: { nav: 0, feed: 0, suggested: 0, ads: 0, explore: 0, notif: 0 },
      paused: 0,
      redirects: 0,
      lastReason: "",
      lastSweepMs: 0
    };

    function qsa(sel, root) {
      try {
        return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
      } catch (e) {
        return [];
      }
    }

    function closest(el, sel) {
      if (!el) return null;
      if (el.closest) return el.closest(sel);
      var n = el;
      while (n && n.nodeType === 1) {
        if (n.matches && n.matches(sel)) return n;
        n = n.parentElement;
      }
      return null;
    }

    function hide(el, cat) {
      if (!el || el.nodeType !== 1) return false;
      if (el === doc.body || el === doc.documentElement) return false;
      if (el.hasAttribute(HIDDEN)) return false;
      if (el.closest && el.closest("#sl-panel,#sl-banner,#sl-toast")) return false;
      el.setAttribute(HIDDEN, cat || "1");
      if (stat.hidden[cat] === undefined) stat.hidden[cat] = 0;
      stat.hidden[cat]++;
      return true;
    }

    function textOf(el) {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    }

    function exactText(el, list) {
      var t = textOf(el);
      for (var i = 0; i < list.length; i++) if (t === list[i]) return true;
      return false;
    }

    /** 릴스 링크 여러 개를 품은 '트레이'를 찾는다. 피드 컨테이너(article 포함)는 절대 반환하지 않는다. */
    function trayOf(a) {
      var el = a.parentElement;
      for (var i = 0; i < 6 && el && el !== doc.body; i++) {
        if (el.querySelectorAll &&
            el.querySelectorAll('a[href^="/reel/"]').length >= 3 &&
            el.querySelectorAll("article").length === 0) {
          return el;
        }
        el = el.parentElement;
      }
      var p = a.parentElement;
      return p && p !== doc.body ? p : null;
    }

    /** 텍스트 라벨을 품은 '한 덩어리' 컨테이너를 찾는다.
     *  article(개별 추천 게시물)이면 그 article을, 캐러셀(제목+묶음)이면 캐러셀 박스를 고른다.
     *  피드 전체처럼 article이 3개 이상인 상위 컨테이너는 절대 고르지 않는다. */
    function unitOf(node) {
      var el = node.parentElement;
      var best = null;
      for (var i = 0; i < 6 && el && el !== doc.body && el.tagName !== "MAIN"; i++) {
        if (el.matches && el.matches("article")) return el;
        var arts = el.querySelectorAll ? el.querySelectorAll("article").length : 0;
        var grouped = el.getAttribute && (el.getAttribute("role") === "group" || el.matches("section,ul,li"));
        var hasBlocks = el.querySelector && el.querySelector('[role="group"],ul,article');
        if (arts <= 2 && (grouped || hasBlocks)) best = el;
        el = el.parentElement;
      }
      return best || node.parentElement || node;
    }

    function isNavLike(a) {
      if (!a) return false;
      if (a.getAttribute("role") && /^(link|tab|menuitem|button)$/.test(a.getAttribute("role"))) return true;
      if (a.querySelector && a.querySelector('svg[aria-label="Reels"],svg[aria-label="릴스"]')) return true;
      if (closest(a, '[role="navigation"],header,nav,[role="tablist"],li')) return true;
      if (exactText(a, LABELS.reels)) return true;
      return false;
    }

    function clickTarget(svg) {
      var n = svg;
      for (var i = 0; i < 4 && n; i++) {
        if (n.tagName === "A" || n.tagName === "BUTTON" || n.getAttribute("role") === "button" || n.tagName === "LI") return n;
        n = n.parentElement;
      }
      return svg.parentElement || svg;
    }

    function applyCss() {
      var css = buildCss(cfg);
      var parent = doc.head || doc.documentElement;
      if (!parent) return null; /* document-start: <html> 도 아직 없다 */
      if (!styleEl || !styleEl.parentNode) {
        styleEl = doc.getElementById(STYLE_ID);
        if (!styleEl) {
          styleEl = doc.createElement("style");
          styleEl.id = STYLE_ID;
          parent.appendChild(styleEl);
        }
      }
      if (styleEl.textContent !== css) styleEl.textContent = css;
      return styleEl;
    }

    /* -------- 라우팅 -------- */

    function redirectTo(to) {
      try {
        if (win.location.replace) win.location.replace(to);
        else win.location.href = to;
        return true;
      } catch (e) {
        return false;
      }
    }

    function enforceRoute() {
      var path = win.location.pathname + win.location.search;
      var d = redirectFor(path, cfg);
      stat.lastReason = d.reason;
      if (d.action !== "redirect") return false;
      var key = path + ">" + d.to;
      var now = Date.now();
      if (redirectLog[key] && now - redirectLog[key] < 2000) {
        /* 두 번 연속 같은 리다이렉트 = 루프. 페이지를 새로고침하지 않고 숨김만 유지한다. */
        return false;
      }
      redirectLog[key] = now;
      stat.redirects++;
      return redirectTo(d.to);
    }

    function routeName() {
      var kind = routeInfo(win.location.pathname);
      return kind === "profile-reels" ? "profile" : kind;
    }

    function syncRouteClasses() {
      var root = doc.documentElement;
      if (!root || !root.classList) return;
      var names = ["home", "explore", "direct", "reel", "profile", "stories", "post", "accounts", "other"];
      for (var i = 0; i < names.length; i++) root.classList.remove("sl-route-" + names[i]);
      root.classList.add("sl-route-" + routeName());
      var single = routeInfo(win.location.pathname) === "reel" && cfg.allowSingleReel;
      if (single) root.classList.add("sl-single-reel");
      else root.classList.remove("sl-single-reel");
      root.classList.add("sl-active");
    }

    /* -------- 스윕(실제 숨김) -------- */

    function sweep(force) {
      if (!doc.body) return stat;
      var t0 = (win.performance && win.performance.now) ? win.performance.now() : Date.now();
      var kind = routeInfo(win.location.pathname);
      var isDirect = kind === "direct";
      var isSingle = kind === "reel" && cfg.allowSingleReel;
      stat.sweeps++;

      /* 1. 릴스 탭 / 아이콘 */
      if (cfg.reelsTab) {
        qsa('a[href="/reels"],a[href="/reels/"]').forEach(function (a) { hide(a, "nav"); });
        qsa('a[href^="/reels/"]').forEach(function (a) { if (isNavLike(a)) hide(a, "nav"); });
        qsa('svg[aria-label="Reels"],svg[aria-label="릴스"]').forEach(function (svg) {
          hide(clickTarget(svg), "nav");
        });
        qsa('[role="tab"][aria-label="Reels"],[role="tab"][aria-label="릴스"]').forEach(function (el) {
          hide(el, "nav");
        });
      }

      /* 2. 프로필의 릴스 탭 */
      if (cfg.hideProfileReelsTab) {
        qsa('a[href$="/reels/"]').forEach(function (a) {
          var href = a.getAttribute("href") || "";
          if (/^\/[A-Za-z0-9._]+\/reels\/$/.test(href)) hide(a, "nav");
        });
      }

      /* 3. 홈 피드에 섞여 들어온 릴스 유닛 + 릴스 트레이 */
      if (cfg.feedReels && kind === "home") {
        qsa("main article").forEach(function (art) {
          if (art.hasAttribute(HIDDEN)) return;
          var isReel = art.querySelector('a[href^="/reel/"]') || art.querySelector('svg[aria-label="Reels"]');
          if (isReel) hide(art, "feed");
        });
        qsa('main a[href^="/reel/"]').forEach(function (a) {
          if (closest(a, "article")) return; /* 위에서 이미 처리 */
          var tray = trayOf(a);
          if (tray) hide(tray, "feed");
        });
      }

      /* 4. 탐색 피드 정리 */
      if (cfg.explore && kind === "explore") {
        qsa('main a[href^="/reel/"]').forEach(function (a) { hide(a, "explore"); });
        qsa("main video").forEach(function (v) { pauseVideo(v); });
      }

      /* 5. 추천 / 광고 (텍스트 라벨 기반)
       * 텍스트 검색은 비싸므로 스크롤 중 매번 돌리지 않는다. 설정 변경(force)일 때는 즉시. */
      var textDue = force || Date.now() - lastTextSweep > 400;
      if (textDue) lastTextSweep = Date.now();

      if (textDue && cfg.suggested) {
        qsa("main span,main div[dir='auto'],main h2,main h3").forEach(function (n) {
          if (!exactText(n, LABELS.suggested)) return;
          if (closest(n, "#sl-panel")) return;
          var unit = unitOf(n);
          hide(unit, "suggested");
        });
      }
      if (textDue && cfg.ads) {
        qsa("main span,main div[dir='auto']").forEach(function (n) {
          if (!exactText(n, LABELS.ads)) return;
          var unit = closest(n, "article");
          if (unit) hide(unit, "ads");
        });
      }

      /* 6. 알림의 'Reels' 추천 */
      if (textDue && cfg.suggested && /\/accounts\/activity/.test(win.location.pathname)) {
        qsa('main li,main article,[role="listitem"]').forEach(function (n) {
          var t = textOf(n);
          if (t.length < 120 && /(^|\s)(Reels|릴스)(\s|$)/.test(t)) hide(n, "notif");
        });
      }

      /* 7. 자동재생 정지 */
      if (cfg.pauseAutoplay && !isDirect) {
        qsa("main video").forEach(function (v) {
          if (closest(v, '[role="dialog"]')) return; /* 스토리 뷰어는 살린다 */
          pauseVideo(v);
        });
      }

      /* 8. 안전 모드: 단일 릴스 한 편만 */
      if (isSingle) {
        var code = singleReelCode();
        qsa('a[href^="/reel/"]').forEach(function (a) {
          var href = (a.getAttribute("href") || "").replace(/\/$/, "");
          if (code && href.indexOf("/reel/" + code) === 0) return; /* 지금 보는 릴스 */
          hide(unitOf(a), "feed");
        });
        qsa('main article ~ article, [aria-label="Next"], [aria-label="다음"], [aria-label="Previous"], [aria-label="이전"]')
          .forEach(function (el) { hide(el, "feed"); });
        showBanner();
      }

      var t1 = (win.performance && win.performance.now) ? win.performance.now() : Date.now();
      stat.lastSweepMs = Math.round((t1 - t0) * 10) / 10;
      if (cfg.debug) debugLog("sweep " + stat.lastSweepMs + "ms");
      return stat;
    }

    function pauseVideo(v) {
      if (!v || v.nodeType !== 1) return false;
      if (v.getAttribute("data-sl-paused") === "1") return false;
      try {
        v.autoplay = false;
        v.removeAttribute("autoplay");
        if (typeof v.pause === "function") v.pause();
        v.setAttribute("data-sl-paused", "1");
        stat.paused++;
        return true;
      } catch (e) {
        return false;
      }
    }

    function resumeAllowance() {
      qsa("video[data-sl-paused]").forEach(function (v) {
        v.removeAttribute("data-sl-paused");
      });
      stat.paused = 0;
    }

    function singleReelCode() {
      var m = /^\/reel\/([^\/]+)/.exec(win.location.pathname);
      return m ? m[1] : "";
    }

    function debugLog(msg) {
      if (!cfg.debug || !win.console) return;
      try { win.console.log("[SocialLite] " + msg); } catch (e) {}
    }

    /* -------- 배너 (안전 모드 안내) -------- */

    function showBanner() {
      if (banner && banner.parentNode) return;
      banner = doc.createElement("div");
      banner.id = "sl-banner";
      banner.setAttribute("role", "status");
      var st = banner.style;
      st.setProperty("position", "fixed", "important");
      st.setProperty("left", "12px", "important");
      st.setProperty("right", "12px", "important");
      st.setProperty("bottom", "calc(76px + env(safe-area-inset-bottom,0px))", "important");
      st.setProperty("z-index", "2147483000", "important");
      st.setProperty("display", "flex", "important");
      st.setProperty("align-items", "center", "important");
      st.setProperty("gap", "10px", "important");
      st.setProperty("padding", "10px 12px", "important");
      st.setProperty("border-radius", "14px", "important");
      st.setProperty("background", "rgba(18,19,24,.94)", "important");
      st.setProperty("color", "#f4f5f7", "important");
      st.setProperty("font", "500 12.5px/1.35 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',system-ui,sans-serif", "important");
      st.setProperty("box-shadow", "0 8px 28px rgba(0,0,0,.45)", "important");
      st.setProperty("border", "1px solid rgba(122,235,200,.35)", "important");
      st.setProperty("backdrop-filter", "blur(12px)", "important");

      var dot = doc.createElement("span");
      dot.style.setProperty("width", "8px", "important");
      dot.style.setProperty("height", "8px", "important");
      dot.style.setProperty("border-radius", "50%", "important");
      dot.style.setProperty("background", "#7aebc8", "important");
      dot.style.setProperty("flex", "0 0 auto", "important");

      var txt = doc.createElement("span");
      txt.textContent = "단일 릴스 확인 모드 · 다음 릴스로 넘어가는 무한 피드는 꺼져 있어요";

      var x = doc.createElement("button");
      x.textContent = "닫기";
      x.style.setProperty("margin-left", "auto", "important");
      x.style.setProperty("background", "transparent", "important");
      x.style.setProperty("border", "0", "important");
      x.style.setProperty("color", "#7aebc8", "important");
      x.style.setProperty("font", "600 12.5px inherit", "important");
      x.style.setProperty("padding", "4px 2px", "important");
      x.addEventListener("click", function () { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); });

      banner.appendChild(dot);
      banner.appendChild(txt);
      banner.appendChild(x);
      doc.body.appendChild(banner);
    }

    /* -------- 옵저버 / 라우팅 훅 -------- */

    function onNavigate() {
      if (!running) return;
      syncRouteClasses();
      if (enforceRoute()) return;
      sweep();
    }

    function schedule() {
      if (!running || pending) return;
      pending = true;
      var raf = win.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      raf(function () {
        pending = false;
        var now = Date.now();
        if (now - lastSweep < 60) {
          setTimeout(function () {
            if (!running) return;
            lastSweep = Date.now();
            sweep();
          }, 60);
          return;
        }
        lastSweep = now;
        sweep();
      });
    }

    function patchHistory() {
      try {
        var proto = win.History && win.History.prototype;
        if (proto && !proto.__slPatched) {
          ["pushState", "replaceState"].forEach(function (m) {
            var orig = proto[m];
            if (typeof orig !== "function") return;
            proto[m] = function () {
              var r = orig.apply(this, arguments);
              try { onNavigate(); } catch (e) {}
              return r;
            };
          });
          proto.__slPatched = true;
        }
      } catch (e) {
        debugLog("history patch failed: " + e.message);
      }
      win.addEventListener("popstate", onNavigate);
      win.addEventListener("hashchange", onNavigate);
    }

    function onDocClick(ev) {
      var el = ev.target;
      while (el && el.nodeType === 1 && el.tagName !== "A") el = el.parentElement;
      if (!el || el.tagName !== "A") return;
      var href = el.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(javascript|mailto|tel):/i.test(href)) return;
      var abs = href;
      if (href.charAt(0) !== "/") {
        try { abs = new win.URL(href, win.location.href).pathname + new win.URL(href, win.location.href).search; }
        catch (e) { return; }
      }
      var d = redirectFor(abs, cfg);
      if (d.action === "redirect") {
        ev.preventDefault();
        ev.stopPropagation();
        stat.lastReason = d.reason;
        stat.redirects++;
        redirectTo(d.to);
      }
    }

    function addTimer(fn, ms) {
      var id = setInterval(fn, ms);
      timers.push(id);
      return id;
    }

    /* -------- 공개 API -------- */

    function startEngine() {
      if (running) return api;
      if (!doc.documentElement) {
        /* @run-at document-start 에서는 <html> 조차 없을 수 있다. 준비되면 다시 부른다. */
        var retry = function () {
          doc.removeEventListener("DOMContentLoaded", retry);
          doc.removeEventListener("readystatechange", retry);
          startEngine();
        };
        doc.addEventListener("DOMContentLoaded", retry);
        doc.addEventListener("readystatechange", retry);
        return api;
      }
      running = true;
      applyCss();
      syncRouteClasses();
      if (enforceRoute()) return api;

      if (doc.readyState === "loading") {
        doc.addEventListener("DOMContentLoaded", function () { sweep(); });
      } else {
        sweep();
      }
      setTimeout(sweep, 300);
      setTimeout(sweep, 1200);

      try {
        observer = new win.MutationObserver(function () { schedule(); });
        observer.observe(doc.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["href", "aria-label", "role"]
        });
      } catch (e) {
        debugLog("MutationObserver unavailable: " + e.message);
      }

      patchHistory();
      doc.addEventListener("click", onDocClick, true);
      addTimer(function () {
        if (!running) return;
        var p = win.location.pathname;
        if (p !== api._lastPath) {
          api._lastPath = p;
          onNavigate();
        }
      }, 800);
      api._lastPath = win.location.pathname;
      debugLog("started v" + VERSION);
      return api;
    }

    var api = {
      version: VERSION,
      _lastPath: "",
      start: startEngine,
      stop: function () {
        running = false;
        if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
        timers.forEach(function (id) { clearInterval(id); });
        timers = [];
        doc.removeEventListener("click", onDocClick, true);
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        styleEl = null;
        qsa("[" + HIDDEN + "]").forEach(function (el) { el.removeAttribute(HIDDEN); });
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        return api;
      },
      sweep: function (force) { return sweep(force); },
      update: function (next) {
        cfg = normConfig(assign({}, cfg, next));
        if (next && next.pauseAutoplay === false) resumeAllowance();
        /* 껐다 켠 설정이 실제로 되살아나도록 숨김 표식을 지우고 다시 훑는다 */
        qsa("[" + HIDDEN + "]").forEach(function (el) { el.removeAttribute(HIDDEN); });
        applyCss();
        syncRouteClasses();
        if (enforceRoute()) return cfg;
        sweep(true);
        return cfg;
      },
      config: function () { return assign({}, cfg); },
      status: function () {
        return {
          version: VERSION,
          route: routeInfo(win.location.pathname),
          path: win.location.pathname,
          config: assign({}, cfg),
          hidden: assign({}, stat.hidden),
          paused: stat.paused,
          sweeps: stat.sweeps,
          redirects: stat.redirects,
          lastReason: stat.lastReason,
          lastSweepMs: stat.lastSweepMs,
          hiddenTotal: (function () {
            var t = 0;
            for (var k in stat.hidden) if (stat.hidden.hasOwnProperty(k)) t += stat.hidden[k];
            return t;
          })()
        };
      }
    };
    return startEngine();
  }

  /* -------------------------------------------- 설정 블록 (빌드/대시보드용) */

  var BLOCK_START = "// ==SL-CONFIG-START==";
  var BLOCK_END = "// ==SL-CONFIG-END==";

  function configBlock(cfg) {
    var c = normConfig(cfg);
    var keys = ["reelsTab", "feedReels", "suggested", "ads", "explore", "pauseAutoplay",
      "allowSingleReel", "hideProfileReelsTab", "redirectTo", "blockExplore"];
    var lines = keys.map(function (k) {
      return "  " + k + ": " + JSON.stringify(c[k]) + ",";
    });
    return BLOCK_START + "\n  window.__SL_CONFIG__ = {\n" + lines.join("\n") + "\n  };\n  " + BLOCK_END;
  }

  function applyConfigToSource(src, cfg) {
    var block = configBlock(cfg);
    if (src.indexOf(BLOCK_START) === -1) return src;
    return src.replace(
      new RegExp(BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" +
        BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      block.replace(/\$/g, "$$$$")
    );
  }

  return {
    version: VERSION,
    DEFAULTS: DEFAULTS,
    LABELS: LABELS,
    HIDDEN_ATTR: HIDDEN,
    STYLE_ID: STYLE_ID,
    normConfig: normConfig,
    routeInfo: routeInfo,
    redirectFor: redirectFor,
    buildCss: buildCss,
    start: start,
    configBlock: configBlock,
    applyConfigToSource: applyConfigToSource
  };
});
