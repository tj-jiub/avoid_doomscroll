#!/usr/bin/env python3
"""SocialLite 번들 빌더.

reels-blocker.js + userscript-ui.js 를 합쳐 설치용 파일 두 개를 만든다.

  socialite.user.js   : Orion / Stay / Userscripts(Tampermonkey)용 유저스크립트
  bookmarklet.js      : 북마크에 넣는 한 줄짜리 javascript: URL

사용: python3 build.py            (node 불필요)
"""
import json
import re
import sys
import urllib.parse


import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
CORE = ROOT / "reels-blocker.js"
UI = ROOT / "userscript-ui.js"


def read(p):
    return p.read_text(encoding="utf-8")


def version(core):
    m = re.search(r'var VERSION = "([^"]+)"', core)
    return m.group(1) if m else "0.0.0"


def defaults_block(core):
    """코어의 DEFAULTS 객체 본문을 그대로 뽑아 설정 블록으로 쓴다."""
    m = re.search(r"var DEFAULTS = \{(.*?)\n  \};", core, re.S)
    if not m:
        raise SystemExit("DEFAULTS 를 찾지 못했습니다")
    body = m.group(1)
    lines = []
    for line in body.splitlines():
        line = re.sub(r"/\*.*?\*/", "", line)
        line = re.sub(r"//.*$", "", line)
        if ":" in line and line.strip():
            lines.append("    " + line.strip())
    return "\n".join(lines)


def config_block(core):
    return (
        "  // ==SL-CONFIG-START==\n"
        "  window.__SL_CONFIG__ = {\n"
        + defaults_block(core)
        + "\n  };\n"
        "  // ==SL-CONFIG-END=="
    )


BOOT = r"""
  /* ── 부트스트랩 ───────────────────────────────────────────── */
  if (!window.__SL_BLOCKER_STARTED__) {
    window.__SL_BLOCKER_STARTED__ = true;

    function decodeHashConfig() {
      var m = /(?:^|[#&])sl=([A-Za-z0-9\-_=]+)/.exec(window.location.hash || "");
      if (!m) return null;
      try {
        var s = m[1].replace(/-/g, "+").replace(/_/g, "/");
        while (s.length % 4) s += "=";
        var raw = window.atob(s);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        var json = (window.TextDecoder ? new TextDecoder().decode(bytes) : raw);
        return JSON.parse(json);
      } catch (e) {
        return null;
      }
    }

    function loadStored() {
      try {
        var raw = window.localStorage && window.localStorage.getItem("socialite.config.v1");
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }

    var cfg = Object.assign({}, window.SocialiteBlocker.DEFAULTS, window.__SL_CONFIG__ || {});
    var stored = loadStored();
    var fromHash = decodeHashConfig();
    if (stored) cfg = Object.assign(cfg, stored);
    if (fromHash) {
      cfg = Object.assign(cfg, fromHash);
      try { window.localStorage.setItem("socialite.config.v1", JSON.stringify(cfg)); } catch (e) {}
    }

    var ctrl = window.SocialiteBlocker.start(cfg);
    window.__SL_CTRL__ = ctrl;

    function mountPanel(tries) {
      if (!window.SocialitePanel) return;
      if (document.documentElement) {
        try { window.SocialitePanel.mount(ctrl); } catch (e) {}
        return;
      }
      if ((tries || 0) < 40) setTimeout(function () { mountPanel((tries || 0) + 1); }, 50);
    }
    mountPanel(0);
  }
"""


def build_userscript(core, ui, ver):
    header = """// ==UserScript==
// @name         SocialLite — 인스타그램에서 릴스만 제거
// @name:en      SocialLite — Instagram without Reels
// @namespace    https://sociallite.app/instagram-without-reels/
// @version      {ver}
// @description  인스타그램의 릴스 탭·피드 속 릴스·탐색 추천 릴스를 걷어내고 DM, 팔로잉 피드, 스토리, 프로필은 그대로 남깁니다. (SocialLite 스타일)
// @author       SocialLite PWA
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @homepageURL  https://sociallite.app/instagram-without-reels/
// ==/UserScript==
""".format(ver=ver)

    parts = [
        header,
        "/* 소스: reels-blocker.js + userscript-ui.js (build.py가 합침) */\n",
        "(function () {\n  \"use strict\";\n\n",
        config_block(core),
        "\n\n",
        core,
        "\n\n",
        ui,
        BOOT,
        "\n})();\n",
    ]
    return "".join(parts)


def strip_comments(src):
    """줄 맨 앞 주석과 블록 주석만 지운다(정규식·문자열 안의 // 는 그대로 둔다)."""
    out = []
    in_block = False
    for line in src.splitlines():
        s = line
        if in_block:
            if "*/" in s:
                s = s.split("*/", 1)[1]
                in_block = False
            else:
                continue
        st = s.lstrip()
        if st.startswith("/*") and "*/" not in st:
            in_block = True
            continue
        if st.startswith("/*") and "*/" in st:
            s = st.split("*/", 1)[1]
            st = s.lstrip()
        if st.startswith("//"):
            continue
        if s.strip():
            out.append(s.rstrip())
    return "\n".join(out)


def url_safe(code):
    """javascript: URL에 그대로 넣을 수 있는 ASCII 한 줄로 만든다.
    브라우저는 실행 전에 퍼센트 디코딩하므로 원래 코드로 돌아온다."""
    out = []
    for ch in code:
        if ch == "%":
            out.append("%25")
        elif ch == "#":
            out.append("%23")
        elif ch == "\n":
            out.append("%0A")
        elif ch == "\t":
            out.append("%09")
        elif ch == " ":
            out.append("%20")
        elif ord(ch) > 126:
            out.append(urllib.parse.quote(ch, safe=""))
        else:
            out.append(ch)
    return "".join(out)


def build_bookmarklet(core, ver):
    small = strip_comments(core)
    code = (
        "javascript:(function(){try{"
        "if(!window.SocialiteBlocker){"
        + small
        + "\n}"
        "var b=window.SocialiteBlocker;"
        "function h(){var m=/(?:^|[#&])sl=([A-Za-z0-9\\-_=]+)/.exec(location.hash||'');if(!m)return null;"
        "try{var s=m[1].replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';"
        "var r=atob(s),u=new Uint8Array(r.length);for(var i=0;i<r.length;i++)u[i]=r.charCodeAt(i);"
        "return JSON.parse(new TextDecoder().decode(u));}catch(e){return null;}}"
        "var c=Object.assign({},b.DEFAULTS,window.__SL_CONFIG__||{},h()||{});"
        "if(window.__SL_CTRL__){window.__SL_CTRL__.update(c);}else{window.__SL_CTRL__=b.start(c);}"
        "}catch(e){alert('SocialLite: '+e.message);}})();"
    )
    # 북마클릿 URL은 한 줄이어야 하고, 공백·개행·%·#·비ASCII는 URL 규칙상 인코딩한다.
    return url_safe(code)


def main():
    core = read(CORE)
    ui = read(UI)
    ver = version(core)

    userscript = build_userscript(core, ui, ver)
    (ROOT / "socialite.user.js").write_text(userscript, encoding="utf-8")

    bookmarklet = build_bookmarklet(core, ver)
    (ROOT / "bookmarklet.js").write_text(bookmarklet + "\n", encoding="utf-8")

    meta = {
        "name": "SocialLite — Instagram without Reels",
        "version": ver,
        "files": {
            "socialite.user.js": len(userscript.encode("utf-8")),
            "bookmarklet.js": len(bookmarklet.encode("utf-8")),
        },
    }
    (ROOT / "build.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("built v{0}: user.js {1:,}B · bookmarklet {2:,}B".format(
        ver, meta["files"]["socialite.user.js"], meta["files"]["bookmarklet.js"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
