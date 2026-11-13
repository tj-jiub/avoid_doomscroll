/*!
 * SocialLite 검증 스위트 (브라우저 실행)
 * ------------------------------------------------------------------
 * tests/index.html 이 이 파일을 불러 실행한다. node 없이도 돌아가도록
 * jsdom 대신 실제 브라우저 iframe + 진짜 DOM/CSS로 검증한다.
 *
 *   · 라우팅(순수 함수)      : /reels/, /reel/CODE/, /사용자명/reels/
 *   · 홈 피드               : 릴스 탭·피드 릴스·트레이 제거 / 사진·일반 동영상·스토리 유지
 *   · DM                    : 대화 목록·공유된 릴스·입력창 유지
 *   · 스토리 뷰어            : 자동재생 정지 설정에서도 살아 있음
 *   · 프로필 / 탐색          : 탭·그리드 유지, 탐색 릴스 셀 제거
 *   · 단일 릴스 안전 모드     : 한 편만, 무한 피드 차단
 *   · 동적 DOM / 실시간 설정  : MutationObserver, update(), stop()
 *   · 정적 CSS / 북마클릿     : 단독 동작
 */
(function () {
  "use strict";

  var results = [];
  var groups = [];
  var currentGroup = "";
  var BASE = {
    core: "/reels-blocker.js",
    css: "/reels-blocker.css",
    user: "/socialite.user.js",
    bookmarklet: "/bookmarklet.js"
  };
  var cache = {};

  /* ---------------------------------------------------------- 수집기 */

  function group(name) {
    currentGroup = name;
    groups.push({ name: name, items: [] });
    return groups[groups.length - 1];
  }

  function check(name, cond, detail) {
    var item = { name: name, ok: !!cond, detail: cond ? (detail || "") : (detail || "") };
    results.push(item);
    if (groups.length) groups[groups.length - 1].items.push(item);
    if (!item.ok) console.warn("[FAIL] " + name + (detail ? " — " + detail : ""));
    else console.log("[ok] " + name);
    return item.ok;
  }

  function step(name) {
    return function (cond, detail) { return check(name, cond, detail); };
  }

  /* ---------------------------------------------------------- 도우미 */

  function fetchText(url) {
    if (!cache[url]) {
      cache[url] = fetch(url, { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error(url + " → HTTP " + r.status);
        return r.text();
      });
    }
    return cache[url];
  }

  function wait(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  async function makeFrame(html, opts) {
    opts = opts || {};
    var frame = document.createElement("iframe");
    frame.className = "stage";
    frame.src = "iframe.html?route=" + encodeURIComponent(opts.route || "/");
    document.body.appendChild(frame);
    await new Promise(function (res) {
      var done = false;
      frame.onload = function () { if (!done) { done = true; res(); } };
      setTimeout(function () { if (!done) { done = true; res(); } }, 4000);
    });

    var doc = frame.contentDocument;
    var win = frame.contentWindow;
    doc.body.innerHTML = html || "";

    if (opts.css) {
      await new Promise(function (res) {
        var link = doc.createElement("link");
        link.rel = "stylesheet";
        link.href = BASE.css;
        link.onload = res;
        link.onerror = res;
        doc.head.appendChild(link);
        setTimeout(res, 1500);
      });
    }

    win.__paused = 0;
    var proto = win.HTMLMediaElement && win.HTMLMediaElement.prototype;
    if (proto && !proto.__slSpy) {
      var orig = proto.pause;
      proto.pause = function () {
        win.__paused++;
        try { return orig.call(this); } catch (e) { return undefined; }
      };
      proto.__slSpy = true;
    }

    var ctrl = null;
    if (!opts.noEngine) {
      var src = await fetchText(BASE.core);
      win.eval(src);
      ctrl = win.SocialiteBlocker.start(opts.config || {});
    }
    return { frame: frame, doc: doc, win: win, ctrl: ctrl, dispose: function () { frame.remove(); } };
  }

  async function withFrame(html, opts, fn) {
    var h = await makeFrame(html, opts);
    try {
      return await fn(h);
    } finally {
      if (h.ctrl) { try { h.ctrl.stop(); } catch (e) {} }
      h.dispose();
    }
  }

  function isHidden(h, el) {
    if (!el) return true;
    if (el.hasAttribute("data-sl-hidden")) return true;
    /* 부모가 숨겨진 경우까지 잡는다 (display 계산값만 보면 자식은 block으로 나온다). */
    if (el.checkVisibility) return !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false });
    var cs = h.win.getComputedStyle(el);
    if (!cs) return false;
    return cs.display === "none" || cs.visibility === "hidden" || el.getClientRects().length === 0;
  }

  function b64url(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function q(h, sel) { return h.doc.querySelector(sel); }
  function qa(h, sel) { return Array.prototype.slice.call(h.doc.querySelectorAll(sel)); }

  /* ---------------------------------------------------------- 1. 라우팅 */

  function suiteRouting() {
    group("라우팅 — /reels/ 는 열리지 않는다");
    var B = window.SocialiteBlocker;
    var d = function (p, cfg) { return B.redirectFor(p, cfg || {}); };

    check("/reels/ → 메인 피드로 리다이렉트", d("/reels/").action === "redirect" && d("/reels/").to === "/", JSON.stringify(d("/reels/")));
    check("/reels (슬래시 없음) → 리다이렉트", d("/reels").action === "redirect");
    check("/reels/audio/123/ → 리다이렉트", d("/reels/audio/123/").action === "redirect");
    check("/reels/explore/ → 리다이렉트", d("/reels/explore/").action === "redirect");
    check("쿼리스트링이 붙어도 잡는다 (/reels/?x=1)", d("/reels/?x=1").action === "redirect");
    check("절대 URL도 잡는다", d("https://www.instagram.com/reels/").action === "redirect");
    check("리다이렉트 목적지 변경 (/direct/inbox/)", d("/reels/", { redirectTo: "/direct/inbox/" }).to === "/direct/inbox/");
    check("위험한 목적지(/reels/)는 / 로 보정", d("/reels/", { redirectTo: "/reels/" }).to === "/");
    check("목적지가 비어 있으면 / 로 보정", d("/reels/", { redirectTo: "" }).to === "/");

    group("라우팅 — 남겨야 할 주소는 건드리지 않는다");
    check("/ 허용", d("/").action === "allow");
    check("/direct/inbox/ 허용", d("/direct/inbox/").action === "allow");
    check("/direct/t/1001/ 허용", d("/direct/t/1001/").action === "allow");
    check("/p/ABC123/ 허용", d("/p/ABC123/").action === "allow");
    check("/stories/friend1/1/ 허용", d("/stories/friend1/1/").action === "allow");
    check("/jiwoo/ (프로필) 허용", d("/jiwoo/").action === "allow");
    check("/explore/ 허용 (정리 모드)", d("/explore/").action === "allow");
    check("/explore/tags/카페/ 허용", d("/explore/tags/cafe/").action === "allow");
    check("/accounts/activity/ 허용", d("/accounts/activity/").action === "allow");

    group("라우팅 — 친구가 DM으로 보낸 단일 릴스");
    var single = d("/reel/ABC123xyz/");
    check("안전 모드 ON: /reel/CODE/ 는 허용", single.action === "allow" && single.reason === "single-reel-safe", JSON.stringify(single));
    check("안전 모드 OFF: 같은 주소는 차단", d("/reel/ABC123xyz/", { allowSingleReel: false }).action === "redirect");
    check("프로필의 릴스 탭은 프로필로 되돌린다", d("/jiwoo/reels/").to === "/jiwoo/", JSON.stringify(d("/jiwoo/reels/")));
    check("탐색 전체 차단 옵션", d("/explore/", { blockExplore: true }).action === "redirect");
  }

  /* ---------------------------------------------------------- 2. 홈 피드 */

  async function suiteHome() {
    group("홈 피드 — 릴스만 사라진다");
    await withFrame(window.SLFixtures.feed(), { route: "/" }, async function (h) {
      var navReels = q(h, '[data-test="nav-reels"]');
      check("하단 바의 릴스 탭 사라짐", isHidden(h, navReels));
      check("홈·탐색·DM 탭은 그대로", !isHidden(h, q(h, 'a[href="/"]')) && !isHidden(h, q(h, 'a[href="/explore/"]')) && !isHidden(h, q(h, 'a[href="/direct/inbox/"]')));
      check("피드 속 릴스 게시물 사라짐", isHidden(h, q(h, '[data-test="post-reel-ABC123"]')));
      check("사진 게시물은 그대로", !isHidden(h, q(h, '[data-test="post-photo-1"]')));
      check("일반 동영상 게시물은 그대로 (릴스 아님)", !isHidden(h, q(h, '[data-test="post-video-2"]')));
      check("릴스 트레이 사라짐", isHidden(h, q(h, '[data-test="reels-tray"]')));
      check("'회원님을 위한 추천' 줄 사라짐", isHidden(h, q(h, '[data-test="suggested"]')));
      check("스토리 트레이 유지", !isHidden(h, q(h, '[data-test="story-tray"]')));
      var stories = qa(h, '[data-test="story-tray"] > div');
      check("스토리 6개 모두 유지", stories.filter(function (el) { return !isHidden(h, el); }).length === 6, "visible=" + stories.length);
      check("광고는 기본값에서 유지 (설정 OFF)", !isHidden(h, q(h, '[data-test="post-ad"]')));
      check("자동재생 설정 OFF면 동영상을 멈추지 않음", h.win.__paused === 0, "pause() 호출 " + h.win.__paused + "회");
      check("스타일 태그는 하나만 주입", qa(h, "#sl-style").length === 1);
      check("DOM을 삭제하지 않는다 (React 보존)", h.doc.body.querySelectorAll("*").length > 20);
      var st = h.ctrl.status();
      check("status(): 숨김 개수 보고", st.hiddenTotal >= 4, JSON.stringify(st.hidden));
    });

    group("홈 피드 — 설정을 켜면 광고도 사라진다");
    await withFrame(window.SLFixtures.feed(), { route: "/", config: { ads: true } }, async function (h) {
      check("광고 게시물 사라짐", isHidden(h, q(h, '[data-test="post-ad"]')));
      check("사진 게시물은 그대로", !isHidden(h, q(h, '[data-test="post-photo-3"]')));
    });

    group("피드 — 자동재생 정지");
    await withFrame(window.SLFixtures.feed(), { route: "/", config: { pauseAutoplay: true } }, async function (h) {
      var vids = qa(h, "main article video");
      check("릴스가 아닌 동영상도 멈춘다", h.win.__paused >= 1, "pause() " + h.win.__paused + "회");
      check("autoplay 속성 제거", vids.every(function (v) {
        return !v.hasAttribute("data-sl-paused") || !v.hasAttribute("autoplay");
      }));
    });
  }

  /* ---------------------------------------------------------- 3. DM */

  async function suiteDirect() {
    group("DM — 하나도 건드리지 않는다");
    await withFrame(window.SLFixtures.direct(), { route: "/direct/inbox/", config: { ads: true, pauseAutoplay: true } }, async function (h) {
      check("대화 목록 유지", !isHidden(h, q(h, '[data-test="dm-list"]')));
      check("대화 4개 모두 유지", qa(h, '[data-test^="thread-"]').filter(function (el) { return !isHidden(h, el); }).length === 5,
        "visible=" + qa(h, '[data-test^="thread-"]').filter(function (el) { return !isHidden(h, el); }).length);
      check("친구가 DM으로 보낸 릴스 썸네일 유지", !isHidden(h, q(h, '[data-test="dm-shared-reel"]')));
      check("대화창의 릴스 메시지 유지", !isHidden(h, q(h, '[data-test="dm-msg-reel"]')));
      check("메시지 입력창 유지", !isHidden(h, q(h, '[data-test="dm-composer"]')));
      check("DM에서는 릴스 탭만 사라짐", isHidden(h, q(h, '[data-test="nav-reels"]')));
      check("DM 동영상은 자동재생 정지 대상 아님", h.win.__paused === 0, "pause() " + h.win.__paused + "회");
    });
  }

  /* ---------------------------------------------------------- 4. 스토리 */

  async function suiteStories() {
    group("스토리 뷰어 — 자동재생 정지 설정에서도 살아 있다");
    await withFrame(window.SLFixtures.storiesViewer(), { route: "/stories/friend1/1/", config: { pauseAutoplay: true } }, async function (h) {
      check("스토리 동영상이 멈추지 않음", h.win.__paused === 0, "pause() " + h.win.__paused + "회");
      check("스토리 '다음' 버튼 유지", !isHidden(h, q(h, '[data-test="story-next"]')));
      check("스토리 뷰어 유지", !isHidden(h, q(h, '[data-test="story-viewer"]')));
    });
  }

  /* ---------------------------------------------------------- 5. 프로필 */

  async function suiteProfile() {
    group("프로필 — 릴스 탭만 정리");
    await withFrame(window.SLFixtures.profile(), { route: "/jiwoo/" }, async function (h) {
      check("프로필의 릴스 탭 사라짐", isHidden(h, q(h, '[data-test="tab-reels"]')));
      check("게시물 탭 유지", !isHidden(h, q(h, '[data-test="tab-posts"]')));
      check("저장됨 탭 유지", !isHidden(h, q(h, '[data-test="tab-saved"]')));
      check("그리드 10칸 전부 유지 (내 릴스 썸네일 포함)", qa(h, '[data-test="profile-grid"] a').filter(function (el) { return !isHidden(h, el); }).length === 10,
        "visible=" + qa(h, '[data-test="profile-grid"] a').filter(function (el) { return !isHidden(h, el); }).length);
      check("프로필 헤더 유지", !isHidden(h, q(h, '[data-test="profile-head"]')));
    });
  }

  /* ---------------------------------------------------------- 6. 탐색 */

  async function suiteExplore() {
    group("탐색 — 릴스 셀 제거 + 자동재생 정지");
    await withFrame(window.SLFixtures.explore(), { route: "/explore/" }, async function (h) {
      check("탐색의 릴스 셀 사라짐", isHidden(h, q(h, '[data-test="cell-reel-1"]')) && isHidden(h, q(h, '[data-test="cell-reel-3"]')));
      check("탐색의 사진 셀 유지", !isHidden(h, q(h, '[data-test="cell-photo-1"]')) && !isHidden(h, q(h, '[data-test="cell-photo-4"]')));
      check("탐색 동영상 자동재생 정지", h.win.__paused >= 1, "pause() " + h.win.__paused + "회");
      check("릴스 탭은 여전히 사라짐", isHidden(h, q(h, '[data-test="nav-reels"]')));
    });

    group("탐색 — 정리 설정을 끄면 원래대로");
    await withFrame(window.SLFixtures.explore(), { route: "/explore/", config: { explore: false } }, async function (h) {
      check("탐색 정리 OFF: 릴스 셀 유지", !isHidden(h, q(h, '[data-test="cell-reel-1"]')));
      check("탐색 정리 OFF: 자동재생 건드리지 않음", h.win.__paused === 0);
    });
  }

  /* ---------------------------------------------------------- 7. 단일 릴스 */

  async function suiteSingleReel() {
    group("단일 릴스 안전 모드 — 한 편만 본다");
    await withFrame(window.SLFixtures.singleReel("ABC123"), { route: "/reel/ABC123/" }, async function (h) {
      check("지금 보는 릴스는 그대로", !isHidden(h, q(h, '[data-test="reel-primary"]')));
      check("'다음' 화살표 사라짐", isHidden(h, q(h, '[data-test="reel-next"]')));
      check("'이전' 화살표 사라짐", isHidden(h, q(h, '[data-test="reel-prev"]')));
      check("다른 릴스 추천 목록 사라짐", isHidden(h, q(h, '[data-test="reel-suggestions"]')));
      check("안전 모드 안내 배너 표시", !!q(h, "#sl-banner") && /단일 릴스/.test(q(h, "#sl-banner").textContent));
      check("라우트 클래스 반영", h.doc.documentElement.classList.contains("sl-single-reel"));
    });

    group("단일 릴스 — 안전 모드를 끄면 아예 막힌다");
    var B = window.SocialiteBlocker;
    check("allowSingleReel:false → 리다이렉트", B.redirectFor("/reel/ABC123/", { allowSingleReel: false }).action === "redirect");
  }

  /* ---------------------------------------------------------- 8. 동적 DOM */

  async function suiteDynamic() {
    group("동적 DOM (React 재렌더) — MutationObserver");
    await withFrame(window.SLFixtures.feed(), { route: "/" }, async function (h) {
      var nav = q(h, '[data-test="nav-mobile"]');
      var link = h.doc.createElement("a");
      link.href = "/reels/";
      link.setAttribute("data-test", "dyn-reels");
      link.innerHTML = '<svg aria-label="Reels"></svg>';
      nav.appendChild(link);
      await wait(320);
      check("나중에 그려진 릴스 탭도 숨긴다", isHidden(h, q(h, '[data-test="dyn-reels"]')));

      var feed = q(h, '[data-test="feed"]');
      var reelArt = h.doc.createElement("article");
      reelArt.setAttribute("data-test", "dyn-reel-post");
      reelArt.innerHTML = '<a href="/reel/NEW999/"><video></video></a>';
      feed.appendChild(reelArt);
      await wait(320);
      check("나중에 그려진 릴스 게시물도 숨긴다", isHidden(h, q(h, '[data-test="dyn-reel-post"]')));

      var photoArt = h.doc.createElement("article");
      photoArt.setAttribute("data-test", "dyn-photo-post");
      photoArt.innerHTML = '<img alt="새 사진"><div><span>좋아요 1개</span></div>';
      feed.appendChild(photoArt);
      await wait(320);
      check("새로 그려진 일반 게시물은 건드리지 않는다", !isHidden(h, q(h, '[data-test="dyn-photo-post"]')));
    });
  }

  /* ---------------------------------------------------------- 9. 실시간 설정 */

  async function suiteLiveConfig() {
    group("실시간 설정 — update() / stop()");
    await withFrame(window.SLFixtures.feed(), { route: "/" }, async function (h) {
      var nav = q(h, '[data-test="nav-reels"]');
      check("시작 상태: 릴스 탭 숨김", isHidden(h, nav));
      h.win.__paused = 0;
      h.ctrl.update({ reelsTab: false });
      check("reelsTab OFF → 릴스 탭이 되살아난다", !isHidden(h, nav));
      check("reelsTab OFF → 피드 릴스는 여전히 숨김", isHidden(h, q(h, '[data-test="post-reel-ABC123"]')));

      h.ctrl.update({ ads: true });
      check("ads ON → 광고가 즉시 사라진다", isHidden(h, q(h, '[data-test="post-ad"]')));

      h.ctrl.update({ reelsTab: true, ads: false, pauseAutoplay: true });
      check("다시 켜면 즉시 숨긴다", isHidden(h, nav));
      check("update() 뒤에도 스타일 태그 1개", qa(h, "#sl-style").length === 1);

      h.ctrl.stop();
      check("stop() → 주입 스타일 제거", qa(h, "#sl-style").length === 0);
      check("stop() → 숨김 표식 제거", qa(h, "[data-sl-hidden]").length === 0);
    });
  }

  /* ---------------------------------------------------------- 10. 무결성 */

  async function suiteIntegrity() {
    group("무결성 — 멱등성 / 성능 / 비파괴");
    await withFrame(window.SLFixtures.feed(), { route: "/" }, async function (h) {
      var before = h.doc.querySelectorAll("[data-sl-hidden]").length;
      h.ctrl.sweep(); h.ctrl.sweep(); h.ctrl.sweep();
      check("여러 번 훑어도 숨김 개수가 늘지 않음(멱등)", h.doc.querySelectorAll("[data-sl-hidden]").length === before,
        before + " → " + h.doc.querySelectorAll("[data-sl-hidden]").length);
      check("스타일 태그 중복 없음", qa(h, "#sl-style").length === 1);

      var bodyKids = h.doc.body.childElementCount;
      h.ctrl.sweep();
      check("sweep이 DOM을 붙였다 떼지 않음", h.doc.body.childElementCount === bodyKids);
    });

    await withFrame(window.SLFixtures.feed(), { route: "/" }, async function (h) {
      var feed = q(h, '[data-test="feed"]');
      var bulk = "";
      for (var i = 0; i < 400; i++) {
        bulk += '<article data-bulk="' + i + '"><a href="/p/B' + i + '/"><img alt=""></a><div><span>좋아요</span></div></article>';
      }
      feed.insertAdjacentHTML("beforeend", bulk);
      var t0 = h.win.performance.now();
      h.ctrl.sweep();
      var ms = h.win.performance.now() - t0;
      check("400개 게시물 스윕이 120ms 이내", ms < 120, ms.toFixed(1) + "ms");
      check("대량 피드에서도 사진 게시물 유지", !isHidden(h, q(h, '[data-bulk="399"]')));
    });
  }

  /* ---------------------------------------------------------- 11. 정적 CSS */

  async function suiteStaticCss() {
    group("정적 CSS 파일 — JS 없이도 동작");
    await withFrame(window.SLFixtures.feed(), { route: "/", css: true, noEngine: true }, async function (h) {
      check("릴스 탭 숨김 (CSS만)", isHidden(h, q(h, '[data-test="nav-reels"]')));
      check("피드 릴스 숨김 (CSS만)", isHidden(h, q(h, '[data-test="post-reel-ABC123"]')));
      check("사진 게시물 유지 (CSS만)", !isHidden(h, q(h, '[data-test="post-photo-1"]')));
      check("스토리 트레이 유지 (CSS만)", !isHidden(h, q(h, '[data-test="story-tray"]')));
      check("DM 링크 유지 (CSS만)", !isHidden(h, q(h, 'a[href="/direct/inbox/"]')));
    });
  }

  /* ---------------------------------------------------------- 12. 번들 */

  async function suiteBundles() {
    group("유저스크립트 번들 — 설치 파일 자체 검증");
    var user = await fetchText(BASE.user);
    check("유저스크립트 메타 헤더", /==UserScript==/.test(user) && /@match\s+https:\/\/www\.instagram\.com/.test(user));
    check("document-start 실행", /@run-at\s+document-start/.test(user));
    check("설정 블록 포함", /==SL-CONFIG-START==[\s\S]*==SL-CONFIG-END==/.test(user));
    check("코어·패널 포함", /SocialiteBlocker\s*=/.test(user) && /SocialitePanel/.test(user));
    check("문법 오류 없음 (파싱)", (function () {
      try { new Function(user.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, "")); return true; }
      catch (e) { return false; }
    })(), "");

    var customized = window.SocialiteBlocker.applyConfigToSource(user, { ads: true, redirectTo: "/direct/inbox/" });
    check("대시보드 설정 주입: ads", /ads:\s*true/.test(customized));
    check("대시보드 설정 주입: redirectTo", /redirectTo:\s*"\/direct\/inbox\/"/.test(customized));
    check("주입 후에도 코드 유효", (function () {
      try { new Function(customized.replace(/^\/\/ ==UserScript==[\s\S]*?==\/UserScript==/, "")); return true; }
      catch (e) { return false; }
    })());

    group("유저스크립트 실제 실행 — 설치 파일을 그대로 돌려 본다");
    await withFrame(window.SLFixtures.feed(), { route: "/", noEngine: true }, async function (h) {
      h.win.alert = function (m) { h.__alert = m; };
      h.win.eval(user);
      await wait(350);
      check("실행 오류 없음", !h.__alert, h.__alert || "");
      check("컨트롤러 등록", !!h.win.__SL_CTRL__);
      check("설정 패널 마운트", !!h.doc.getElementById("sl-panel"));
      check("릴스 탭 숨김", isHidden(h, q(h, '[data-test="nav-reels"]')));
      check("사진 게시물 유지", !isHidden(h, q(h, '[data-test="post-photo-1"]')));
      check("스토리 유지", !isHidden(h, q(h, '[data-test="story-tray"]')));
    });

    group("유저스크립트 — 대시보드에서 넘긴 설정(#sl=…)이 적용된다");
    var hashCfg = { ads: true, reelsTab: false, feedReels: true, redirectTo: "/direct/inbox/" };
    var hashB64 = b64url(JSON.stringify(hashCfg));
    await withFrame(window.SLFixtures.feed(), { route: "/", noEngine: true }, async function (h) {
      h.win.location.hash = "#sl=" + hashB64;
      h.win.eval(user);
      await wait(350);
      check("hash 설정: 릴스 탭은 일부러 켜 둠(reelsTab false)", !isHidden(h, q(h, '[data-test="nav-reels"]')));
      check("hash 설정: 광고 숨김", isHidden(h, q(h, '[data-test="post-ad"]')));
      check("hash 설정: 피드 릴스는 그대로 숨김", isHidden(h, q(h, '[data-test="post-reel-ABC123"]')));
      check("hash 설정: 컨트롤러 설정에 반영", h.win.__SL_CTRL__ && h.win.__SL_CTRL__.config().redirectTo === "/direct/inbox/");
      check("hash 설정: 다음 방문을 위해 저장", (function () {
        try { return JSON.parse(h.win.localStorage.getItem("socialite.config.v1")).ads === true; }
        catch (e) { return false; }
      })());
    });

    group("북마클릿 — 한 줄짜리 javascript: URL");
    var bm = (await fetchText(BASE.bookmarklet)).trim();
    check("javascript: 로 시작", bm.indexOf("javascript:") === 0);
    check("줄바꿈 없이 한 줄", !/[\r\n]/.test(bm));
    check("공백·비ASCII 없음 (URL 안전)", !/[^\x21-\x7e%]/.test(bm), (bm.match(/[^\x21-\x7e%]/g)||[]).slice(0,5).join(""));
    check("크기 64KB 이하", bm.length < 64000, (bm.length / 1024).toFixed(1) + "KB");

    var code = decodeURIComponent(bm.replace(/^javascript:/, ""));
    await withFrame(window.SLFixtures.feed({ withSuggested: false }), { route: "/", noEngine: true }, async function (h) {
      h.win.alert = function (msg) { h.__alert = msg; };
      h.win.__SL_BM_RUN__ = 0;
      h.win.eval(code);
      await wait(200);
      check("북마클릿 실행 시 오류 없음", !h.__alert, h.__alert || "");
      check("북마클릿: 릴스 탭 숨김", isHidden(h, q(h, '[data-test="nav-reels"]')));
      check("북마클릿: 피드 릴스 숨김", isHidden(h, q(h, '[data-test="post-reel-ABC123"]')));
      check("북마클릿: 사진 게시물 유지", !isHidden(h, q(h, '[data-test="post-photo-1"]')));
      check("북마클릿: 컨트롤러 등록", !!h.win.__SL_CTRL__);
    });
  }

  /* ---------------------------------------------------------- 실행 */

  async function run() {
    results.length = 0;
    groups.length = 0;
    var t0 = performance.now();
    try {
      suiteRouting();
      await suiteHome();
      await suiteDirect();
      await suiteStories();
      await suiteProfile();
      await suiteExplore();
      await suiteSingleReel();
      await suiteDynamic();
      await suiteLiveConfig();
      await suiteIntegrity();
      await suiteStaticCss();
      await suiteBundles();
    } catch (e) {
      check("스위트 실행 중 예외", false, (e && e.message) || String(e));
      if (console && console.error) console.error(e);
    }
    var passed = results.filter(function (r) { return r.ok; }).length;
    var out = {
      passed: passed,
      failed: results.length - passed,
      total: results.length,
      ms: Math.round(performance.now() - t0),
      groups: groups,
      results: results
    };
    window.__SL_TEST_RESULTS__ = out;
    render(out);
    return out;
  }

  function render(out) {
    var badge = document.getElementById("badge");
    var bar = document.getElementById("bar");
    var count = document.getElementById("count");
    var host = document.getElementById("out");
    if (!badge || !host) return;
    var allOk = out.failed === 0;
    badge.textContent = allOk ? "전체 통과 " + out.passed + "/" + out.total : "실패 " + out.failed + "건";
    badge.className = "badge " + (allOk ? "pass" : "fail");
    bar.style.width = Math.round((out.passed / out.total) * 100) + "%";
    bar.style.background = allOk ? "#7aebc8" : "#ff8585";
    count.textContent = out.ms + "ms";

    host.innerHTML = "";
    out.groups.forEach(function (g) {
      var h2 = document.createElement("h2");
      var fails = g.items.filter(function (i) { return !i.ok; }).length;
      h2.textContent = g.name + (fails ? "  ·  실패 " + fails : "");
      host.appendChild(h2);
      var ul = document.createElement("ul");
      g.items.forEach(function (i) {
        var li = document.createElement("li");
        li.className = i.ok ? "ok" : "no";
        var m = document.createElement("span");
        m.className = "m";
        m.textContent = i.ok ? "✓" : "✕";
        var t = document.createElement("span");
        t.textContent = i.name;
        if (i.detail) {
          var d = document.createElement("span");
          d.className = "d";
          d.textContent = " — " + i.detail;
          t.appendChild(d);
        }
        li.appendChild(m);
        li.appendChild(t);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    });
  }

  var again = document.getElementById("again");
  if (again) again.addEventListener("click", function () { run(); });

  if (document.readyState === "complete") run();
  else window.addEventListener("load", function () { run(); });

  window.SLTest = { run: run, results: function () { return results; } };
})();
