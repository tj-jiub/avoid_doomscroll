/*!
 * SocialLite Reels Blocker — 인스타그램 안에서 쓰는 설정 패널
 * reels-blocker.js 뒤에 로드한다. Shadow DOM이라 인스타그램 CSS와 서로 간섭하지 않는다.
 *
 * 사용: SocialitePanel.mount(controller)
 */
(function (root) {
  "use strict";

  var STORE_KEY = "socialite.config.v1";
  var POS_KEY = "socialite.panel.pos.v1";

  var TOGGLES = [
    { key: "reelsTab", label: "릴스 탭 제거", desc: "하단 바 · 사이드바의 릴스 아이콘", risk: "core" },
    { key: "feedReels", label: "피드 속 릴스 제거", desc: "피드에 섞여 들어오는 릴스 유닛", risk: "core" },
    { key: "suggested", label: "추천 캐러셀 숨김", desc: "‘회원님을 위한 추천’ 줄", risk: "soft" },
    { key: "ads", label: "광고 숨김", desc: "Sponsored · 광고 게시물", risk: "soft" },
    { key: "explore", label: "탐색 피드 정리", desc: "탐색의 릴스 셀 · 자동재생 정지", risk: "soft" },
    { key: "pauseAutoplay", label: "동영상 자동재생 정지", desc: "피드 동영상이 스스로 재생되지 않게", risk: "soft" },
    { key: "allowSingleReel", label: "단일 릴스 안전 모드", desc: "DM으로 받은 릴스 한 편은 열어 줌", risk: "keep" },
    { key: "hideProfileReelsTab", label: "프로필 릴스 탭 숨김", desc: "내 프로필 상단의 릴스 탭", risk: "keep" }
  ];

  var SHEET_CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Segoe UI',system-ui,sans-serif}",
    ".fab{position:fixed;z-index:2147483000;width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;",
    "background:rgba(16,17,22,.92);border:1px solid rgba(255,255,255,.12);box-shadow:0 6px 20px rgba(0,0,0,.45);",
    "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer;touch-action:none;user-select:none}",
    ".fab svg{width:22px;height:22px}",
    ".fab .dot{position:absolute;top:7px;right:7px;width:7px;height:7px;border-radius:50%;background:#7aebc8;box-shadow:0 0 0 2px rgba(16,17,22,.9)}",
    ".sheet{position:fixed;z-index:2147483001;width:min(340px,calc(100vw - 24px));max-height:78vh;overflow:auto;",
    "background:#101116;color:#f2f3f6;border:1px solid rgba(255,255,255,.10);border-radius:20px;",
    "box-shadow:0 24px 60px rgba(0,0,0,.6);padding:16px 16px 12px;display:none}",
    ".sheet.open{display:block}",
    ".hd{display:flex;align-items:center;gap:8px;margin-bottom:2px}",
    ".hd b{font-size:14px;letter-spacing:-.01em;font-weight:650}",
    ".hd .tag{font-size:10px;font-weight:700;letter-spacing:.04em;color:#0d0f12;background:#7aebc8;padding:2px 6px;border-radius:6px}",
    ".hd button{margin-left:auto;background:transparent;border:0;color:#8b909c;font-size:13px;padding:4px;cursor:pointer}",
    ".stat{font-size:11.5px;color:#8b909c;margin:6px 0 12px;line-height:1.5}",
    ".stat b{color:#c9cdd8;font-weight:600}",
    ".row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.055)}",
    ".row .tx{flex:1;min-width:0}",
    ".row .nm{font-size:12.5px;font-weight:600}",
    ".row .ds{font-size:10.5px;color:#8b909c;margin-top:2px;line-height:1.35}",
    ".sw{flex:0 0 auto;width:38px;height:22px;border-radius:11px;background:#2a2d36;position:relative;cursor:pointer;transition:background .18s}",
    ".sw::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#e8eaef;transition:transform .18s}",
    ".sw.on{background:#7aebc8}",
    ".sw.on::after{transform:translateX(16px);background:#101116}",
    ".ft{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.055);display:flex;align-items:center;gap:8px;font-size:10.5px;color:#767b87}",
    ".ft button{margin-left:auto;background:rgba(255,255,255,.06);border:0;color:#c9cdd8;font-size:10.5px;padding:5px 9px;border-radius:8px;cursor:pointer}",
    ".toast{position:fixed;z-index:2147483002;left:50%;transform:translateX(-50%);bottom:150px;background:rgba(16,17,22,.96);color:#f2f3f6;",
    "border:1px solid rgba(122,235,200,.3);border-radius:12px;padding:8px 12px;font-size:11.5px;opacity:0;transition:opacity .2s;pointer-events:none}",
    ".toast.show{opacity:1}"
  ].join("");

  function readStore() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStore(cfg) {
    try {
      root.localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
    } catch (e) {}
  }

  function readPos() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(POS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function storePos(x, y) {
    try {
      root.localStorage.setItem(POS_KEY, JSON.stringify({ x: x, y: y }));
    } catch (e) {}
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function mount(ctrl) {
    if (!ctrl || document.getElementById("sl-panel")) return null;
    var doc = document;

    var host = doc.createElement("div");
    host.id = "sl-panel";
    host.style.cssText = "all:initial;position:static";
    doc.documentElement.appendChild(host);

    var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : null;
    if (!shadow) return null;

    var style = doc.createElement("style");
    style.textContent = SHEET_CSS;
    shadow.appendChild(style);

    var fab = el("button", "fab");
    fab.type = "button";
    fab.setAttribute("aria-label", "SocialLite 설정");
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M8.5 5.6v12.8c0 .5.55.8.98.55l10.1-6.4a.65.65 0 0 0 0-1.1L9.48 5.05a.65.65 0 0 0-.98.55Z" fill="#f2f3f6" opacity=".28"/>' +
      '<path d="M4.2 19.2 19.8 4.8" stroke="#7aebc8" stroke-width="2.1" stroke-linecap="round"/>' +
      "</svg><span class='dot'></span>";

    var sheet = el("div", "sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "SocialLite 설정");

    var hd = el("div", "hd");
    var brand = el("b", null, "SocialLite");
    var tag = el("span", "tag", "REELS OFF");
    var closeBtn = el("button", null, "닫기");
    hd.appendChild(brand);
    hd.appendChild(tag);
    hd.appendChild(closeBtn);

    var stat = el("div", "stat", "");
    sheet.appendChild(hd);
    sheet.appendChild(stat);

    var rows = {};
    TOGGLES.forEach(function (t) {
      var row = el("div", "row");
      var tx = el("div", "tx");
      tx.appendChild(el("div", "nm", t.label));
      tx.appendChild(el("div", "ds", t.desc));
      var sw = el("div", "sw");
      sw.setAttribute("role", "switch");
      sw.setAttribute("tabindex", "0");
      sw.dataset.key = t.key;
      sw.addEventListener("click", function () { toggle(t.key); });
      sw.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(t.key); }
      });
      row.appendChild(tx);
      row.appendChild(sw);
      sheet.appendChild(row);
      rows[t.key] = sw;
    });

    var ft = el("div", "ft");
    ft.appendChild(el("span", null, "v" + ctrl.version));
    var reset = el("button", null, "기본값으로");
    reset.type = "button";
    reset.addEventListener("click", function () {
      var base = Object.assign({}, root.SocialiteBlocker.DEFAULTS, root.__SL_CONFIG__ || {});
      apply(base, true);
      toast("기본 설정으로 되돌렸어요");
    });
    ft.appendChild(reset);
    sheet.appendChild(ft);

    var toastEl = el("div", "toast");
    shadow.appendChild(fab);
    shadow.appendChild(sheet);
    shadow.appendChild(toastEl);

    function toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { toastEl.classList.remove("show"); }, 1600);
    }

    function paint() {
      var cfg = ctrl.config();
      TOGGLES.forEach(function (t) {
        var sw = rows[t.key];
        if (!sw) return;
        if (cfg[t.key]) sw.classList.add("on");
        else sw.classList.remove("on");
        sw.setAttribute("aria-checked", cfg[t.key] ? "true" : "false");
      });
      var st = ctrl.status();
      var routeName = {
        home: "홈 피드", explore: "탐색", direct: "DM", reel: "단일 릴스",
        profile: "프로필", stories: "스토리", post: "게시물", other: "기타"
      }[st.route] || st.route;
      stat.innerHTML =
        "지금 <b>" + routeName + "</b> · 숨김 <b>" + st.hiddenTotal + "개</b>" +
        " · 차단 리다이렉트 <b>" + st.redirects + "회</b>";
    }

    function apply(next, persist) {
      ctrl.update(next);
      if (persist !== false) writeStore(ctrl.config());
      paint();
    }

    function toggle(key) {
      var cfg = ctrl.config();
      cfg[key] = !cfg[key];
      apply(cfg);
      if (key === "reelsTab") toast(cfg[key] ? "릴스 탭을 다시 숨겼어요" : "릴스 탭을 잠시 보여줘요");
    }

    var open = false;
    function setOpen(v) {
      open = v;
      sheet.classList.toggle("open", v);
      if (v) {
        paint();
        place();
      }
    }

    fab.addEventListener("click", function () {
      if (suppressClick) { suppressClick = false; return; }
      setOpen(!open);
    });
    closeBtn.addEventListener("click", function () { setOpen(false); });

    /* 드래그로 위치 이동 (인스타 UI를 가리지 않게) */
    var drag = null;
    var suppressClick = false;
    fab.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, moved: false };
      fab.style.cursor = "grabbing";
    });
    root.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
      if (!drag.moved) return;
      var r = fab.getBoundingClientRect();
      fab.style.left = Math.min(Math.max(6, e.clientX - r.width / 2), window.innerWidth - r.width - 6) + "px";
      fab.style.top = Math.min(Math.max(60, e.clientY - r.height / 2), window.innerHeight - r.height - 6) + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      if (open) place();
    }, true);
    root.addEventListener("pointerup", function () {
      if (!drag) return;
      if (drag.moved) {
        var r = fab.getBoundingClientRect();
        storePos(r.left, r.top);
        suppressClick = true;
      }
      drag = null;
      fab.style.cursor = "pointer";
    }, true);

    /* 시트를 FAB 가까이에 붙인다 */
    function place() {
      var r = fab.getBoundingClientRect();
      var w = Math.min(340, window.innerWidth - 24);
      var left = Math.min(Math.max(12, r.left + r.width - w), window.innerWidth - w - 12);
      var below = r.top < window.innerHeight / 2;
      sheet.style.left = left + "px";
      sheet.style.right = "auto";
      if (below) {
        sheet.style.top = r.bottom + 8 + "px";
        sheet.style.bottom = "auto";
      } else {
        sheet.style.bottom = window.innerHeight - r.top + 8 + "px";
        sheet.style.top = "auto";
      }
    }

    var pos = readPos();
    if (pos && typeof pos.x === "number") {
      fab.style.left = Math.min(Math.max(6, pos.x), window.innerWidth - 52) + "px";
      fab.style.top = Math.min(Math.max(60, pos.y), window.innerHeight - 52) + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    } else {
      fab.style.right = "12px";
      fab.style.bottom = "calc(96px + env(safe-area-inset-bottom, 0px))";
    }

    root.addEventListener("resize", function () { if (open) place(); });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) setOpen(false);
    });

    /* 인스타그램이 body를 갈아끼워도 패널은 html에 붙어 있어 살아남는다. */
    var mo = new MutationObserver(function () {
      if (!host.parentNode) doc.documentElement.appendChild(host);
      if (!fab.parentNode) shadow.appendChild(fab);
    });
    mo.observe(doc.documentElement, { childList: true });

    var poll = setInterval(paint, 1500);
    host.__slCleanup = function () { clearInterval(poll); mo.disconnect(); };

    paint();
    return { paint: paint, open: function () { setOpen(true); }, close: function () { setOpen(false); } };
  }

  root.SocialitePanel = { mount: mount, TOGGLES: TOGGLES };
})(typeof window !== "undefined" ? window : this);
