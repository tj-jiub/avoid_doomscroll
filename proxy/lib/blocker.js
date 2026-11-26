'use strict';
/*
 * SocialLite proxy — injected blocker (CSS in <head>, JS right after it).
 *
 * CSS is scoped with html:not(.sl-off) so the SL pill can turn everything back
 * on instantly without touching attributes. The JS targets the REAL mobile
 * Instagram Web DOM: href, aria-label (any case), visible tab text ("릴스"),
 * role=tab/link/button wrappers, feed cards and reel trays, plus route + click
 * guards. No hashed class names are ever used.
 *
 * Nothing here may contain a backtick or ${ — the whole JS body is one template
 * literal that gets inlined into <head>.
 */

const CSS = `
#sl-pill{position:fixed;left:10px;bottom:calc(74px + env(safe-area-inset-bottom,0px));z-index:2147483000;
 display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:999px;background:rgba(13,14,21,.92);
 color:#e9ebff;font:700 11px/1 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;
 letter-spacing:.02em;border:1px solid rgba(124,140,255,.45);box-shadow:0 8px 24px rgba(0,0,0,.5);
 -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);cursor:pointer;-webkit-user-select:none;
 user-select:none;touch-action:manipulation}
#sl-pill .sl-dot{width:6px;height:6px;border-radius:50%;background:#5FE3C0;box-shadow:0 0 7px rgba(95,227,192,.9);flex:0 0 auto}
html.sl-off #sl-pill .sl-dot{background:#7d8296;box-shadow:none}
#sl-pill b{font-weight:800;color:#8f9cff;font-size:11px}
#sl-pill em{font-style:normal;font-weight:600;font-size:10.5px;color:#a9aec4}
#sl-dm{position:fixed;top:calc(6px + env(safe-area-inset-top,0px));right:6px;z-index:2147483000;
 width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 background:rgba(13,14,21,.78);border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 14px rgba(0,0,0,.35);
 -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;text-decoration:none;
 opacity:.92;transition:opacity .15s,transform .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#sl-dm:active{transform:scale(.94);opacity:1}
#sl-dm svg{width:18px;height:18px;display:block;fill:currentColor}
html.sl-off #sl-dm{display:none}
#sl-toast{position:fixed;left:50%;transform:translate(-50%,12px);bottom:calc(132px + env(safe-area-inset-bottom,0px));
 z-index:2147483001;max-width:86vw;padding:10px 14px;border-radius:12px;background:rgba(13,14,21,.95);
 border:1px solid rgba(124,140,255,.34);color:#f2f3fb;
 font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;
 box-shadow:0 12px 32px rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;text-align:center}
#sl-toast.on{opacity:1;transform:translate(-50%,0)}
#sl-panel{position:fixed;inset:auto 8px calc(8px + env(safe-area-inset-bottom,0px)) 8px;max-height:62vh;overflow:auto;
 z-index:2147483002;background:rgba(10,11,18,.97);color:#e8eaf6;border:1px solid rgba(124,140,255,.4);border-radius:14px;
 padding:12px 12px 14px;font:500 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
 box-shadow:0 18px 48px rgba(0,0,0,.6);white-space:pre-wrap;word-break:break-all}
#sl-panel h4{margin:0 0 8px;font:800 11px/1.2 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#8f9cff;letter-spacing:.04em}
#sl-panel .sl-row{margin:0 0 3px;color:#c9cde0}
#sl-panel .sl-k{color:#7d8296}
#sl-panel .sl-hl{color:#5FE3C0}
#sl-panel .sl-btns{display:flex;gap:8px;margin-top:10px}
#sl-panel button{flex:1;padding:9px 10px;border-radius:10px;border:1px solid rgba(124,140,255,.45);
 background:rgba(124,140,255,.12);color:#dfe3ff;font:700 11px/1 -apple-system,system-ui,sans-serif}
html.sl-debug [data-sl]{outline:2px solid #ff4d6d!important;outline-offset:-2px!important}

/* ── the actual Reels hiding (only while SocialLite is ON) ── */
html:not(.sl-off) [data-sl="1"]{display:none!important;pointer-events:none!important}
html:not(.sl-off) [data-sl-tray="1"]{display:none!important}
html:not(.sl-off) a[href="/reels"],html:not(.sl-off) a[href="/reels/"],
html:not(.sl-off) a[href$="/reels"],html:not(.sl-off) a[href$="/reels/"]{display:none!important}
html:not(.sl-off) [aria-label*="reels" i],html:not(.sl-off) [aria-label*="릴스"]{display:none!important}
html:not(.sl-off) [role="tab"][aria-label*="reel" i],html:not(.sl-off) [role="tab"][aria-label*="릴스"]{display:none!important}
html:not(.sl-off) [role="tablist"] a[href*="/reel"]{display:none!important}
html:not(.sl-off) nav a[href*="/reel"],html:not(.sl-off) [role="navigation"] a[href*="/reel"]{display:none!important}
html:not(.sl-off) header a[href*="/reel"],html:not(.sl-off) footer a[href*="/reel"]{display:none!important}
`;

const JS = `
(function(){
"use strict";
var W=window,D=document,R=D.documentElement;
if(W.__SL__&&W.__SL__.v)return;
var V="3.0.0";
var S={v:V,on:true,single:true,blocked:0,rules:{},ready:false};
var PILL="sl-pill",TOAST="sl-toast",PANEL="sl-panel",DM="sl-dm";
var NAVSTOP='nav,[role="navigation"],[role="tablist"],[role="menubar"],header,[role="banner"],footer,[role="contentinfo"],main,[role="main"],body,html';
var NAVBOX='nav,[role="navigation"],[role="tablist"],[role="menubar"],header,[role="banner"],footer,[role="contentinfo"]';
var REELWORD=/릴스|reels?/i;

function q(s,r){try{return Array.prototype.slice.call((r||D).querySelectorAll(s));}catch(e){return [];}}
function txt(n){return String((n&&n.textContent)||"").replace(/\\s+/g," ").trim();}
function mk(t,c){var e=D.createElement(t);if(c)e.className=c;return e;}
function pathOf(h){
  if(!h)return "";
  if(h.charAt(0)==="/")return h.split(/[?#]/)[0];
  try{var u=new W.URL(h,W.location.href);if(/(^|\\.)instagram\\.com$/i.test(u.hostname))return u.pathname;}catch(e){}
  return "";
}
function isReels(p){return /^\\/reels(\\/|$)/.test(p)||/^\\/[^\\/]+\\/reels(\\/|$)/.test(p);}
function isReelOne(p){return /^\\/reel\\/[^\\/]+/.test(p);}
function isReelAny(p){return isReels(p)||isReelOne(p);}

/* persistence — the sl_off cookie is also read server-side for /reels redirects */
function getOff(){
  try{if(/(?:^|;\\s*)sl_off=1/.test(D.cookie))return true;}catch(e){}
  try{if(W.localStorage&&W.localStorage.getItem("sl_off")==="1")return true;}catch(e){}
  return false;
}
function putOff(v){
  try{if(v)D.cookie="sl_off=1;path=/;max-age=31536000;SameSite=Lax";
      else D.cookie="sl_off=;path=/;max-age=0;SameSite=Lax";}catch(e){}
  try{if(W.localStorage)W.localStorage.setItem("sl_off",v?"1":"0");}catch(e){}
}

function mark(el,why,kind){
  if(!el||el.nodeType!==1)return false;
  if(el===D.body||el===D.documentElement||el===D.head)return false;
  if(el.id===PILL||el.id===TOAST||el.id===PANEL||el.id===DM)return false;
  if(el.matches&&el.matches(NAVSTOP))return false;
  if(!el.hasAttribute)return false;
  if(el.hasAttribute("data-sl")||el.hasAttribute("data-sl-tray"))return false;
  el.setAttribute(kind==="tray"?"data-sl-tray":"data-sl","1");
  S.blocked++;
  var k=(why||"?")+(kind==="tray"?":tray":"");
  S.rules[k]=(S.rules[k]||0)+1;
  return true;
}
function containerOf(el){
  var n=el;
  for(var i=0;i<12&&n&&n!==D.documentElement;i++,n=n.parentElement){
    if(n.matches&&n.matches(NAVBOX))return n;
  }
  return null;
}
function navItemFrom(el,box){
  var n=el,best=el,i=0;
  while(n&&n!==box&&n.parentElement&&i<10){
    var p=n.parentElement;
    if(p===box){
      /* Stop before hiding a wrapper that holds multiple nav tabs (e.g. a flex row of all 5 tabs) */
      var siblings=n.querySelectorAll?n.querySelectorAll('a[href],[role="tab"],[role="link"],[role="button"]').length:0;
      if(siblings<=1)best=n;
      break;
    }
    var pTabs=p.querySelectorAll?p.querySelectorAll('a[href],[role="tab"],[role="link"],[role="button"]').length:0;
    if(pTabs>1)break;
    best=p;n=p;i++;
  }
  return best;
}
function trayOf(el){
  var n=el.parentElement,i=0,best=null;
  while(n&&n!==D.body&&i<8){
    if(n.matches&&n.matches('main,[role="main"],nav,[role="navigation"]'))break;
    if(n.querySelectorAll){
      var reels=n.querySelectorAll('a[href*="/reel"]').length;
      var all=n.querySelectorAll('a[href]').length;
      var arts=n.querySelectorAll('article,[role="article"]').length;
      /* a tray is almost all reels; a mixed explore grid is not */
      if(arts===0&&reels>=3&&all<=16&&reels/all>=0.75)best=n;
    }
    n=n.parentElement;i++;
  }
  return best;
}
/* a reel card whose wrapper is not an <article> (modern mobile feed) */
function cardOf(el){
  var n=el,best=el,i=0;
  while(n&&n.parentElement&&i<6){
    var p=n.parentElement;
    if(p.matches&&p.matches('main,[role="main"],body,nav,[role="navigation"]'))break;
    if(!p.querySelectorAll)break;
    var reels=p.querySelectorAll('a[href*="/reel"]').length;
    var arts=p.querySelectorAll('article,[role="article"]').length;
    if(reels>=2||arts>=1)break;
    if(p.children&&p.children.length>6)break;
    best=p;n=p;i++;
  }
  return best;
}
function handleReel(el,why){
  var box=containerOf(el);
  if(box){mark(navItemFrom(el,box),why);return;}
  var art=el.closest&&el.closest('article,[role="article"]');
  if(art){mark(art,why);return;}
  var t=trayOf(el);
  if(t){mark(t,why,"tray");return;}
  mark(cardOf(el)||el,why);
}

function textIsReels(el){
  var t=txt(el);
  if(!t||t.length>12)return false;
  return /^(릴스|릴스 탭|reels?|reels? tab|reels?\\s*탭)$/i.test(t);
}
function labelIsReels(el){
  var a=el.getAttribute&&el.getAttribute("aria-label");
  if(!a)return false;
  return REELWORD.test(a);
}

function sweep(){
  if(!S.on||!D.body)return;
  var i,el,p,as=q("a[href]");
  for(i=0;i<as.length;i++){
    p=pathOf(as[i].getAttribute("href"));
    if(p&&isReelAny(p))handleReel(as[i],"href");
  }
  var lab=q('[aria-label*="reel" i],[aria-label*="릴스"]');
  for(i=0;i<lab.length;i++)handleReel(lab[i],"label");
  /* nav surfaces only: cheap, and where a text-only 릴스 tab lives */
  var zones=q('nav *,[role="navigation"] *,[role="tablist"] *,[role="tab"]');
  for(i=0;i<zones.length;i++){
    if(textIsReels(zones[i]))handleReel(zones[i],"text");
  }
  paint();
}

var lastGuard=0;
function guard(){
  if(!S.on)return false;
  var p=W.location.pathname||"";
  if(!(isReels(p)||(!S.single&&isReelOne(p))))return false;
  var now=Date.now();
  if(now-lastGuard<1500)return true;
  lastGuard=now;
  toast("릴스는 SocialLite가 막았어요 · 원래 화면으로 돌아갑니다");
  setTimeout(function(){
    if(isReels(W.location.pathname)){
      var to="/";
      try{
        var m=/^\\/([A-Za-z0-9._]+)\\/reels/.exec(W.location.pathname);
        if(m)to="/"+m[1]+"/";
      }catch(e){}
      try{W.location.replace(to);}catch(e2){W.location.href=to;}
    }
  },260);
  return true;
}
function routeSoon(){setTimeout(function(){try{guard();sweep();}catch(e){}},60);}

function clickGuard(ev){
  if(!S.on)return;
  var n=ev.target,hit=null,i=0;
  for(;i<8&&n&&n!==D.body;i++,n=n.parentElement){
    if(!n.getAttribute)continue;
    var p=pathOf(n.getAttribute("href"));
    if(p&&isReelAny(p)){hit=n;break;}
    if(labelIsReels(n)){hit=n;break;}
    var role=n.getAttribute("role")||"";
    if((n.tagName==="A"||n.tagName==="BUTTON"||role==="link"||role==="button"||role==="tab")&&textIsReels(n)){hit=n;break;}
  }
  if(!hit)return;
  try{ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();}catch(e){}
  toast("릴스는 SocialLite가 막았어요");
}

var toastTm=null;
function toast(msg){
  if(!D.body)return;
  var t=D.getElementById(TOAST);
  if(!t){t=mk("div");t.id=TOAST;D.body.appendChild(t);}
  t.textContent=msg;t.className="on";
  clearTimeout(toastTm);toastTm=setTimeout(function(){t.className="";},2400);
}
function counts(){
  var out={};
  for(var k in S.rules){if(S.rules[k])out[k]=S.rules[k];}
  return out;
}
function shown(){return q('[data-sl="1"],[data-sl-tray="1"]').length;}
function paint(){
  var pill=D.getElementById(PILL);
  if(!pill)return;
  var em=pill.getElementsByTagName("em")[0];
  if(!em)return;
  var n=shown();
  S.blocked=n;
  var t=(!S.on)?"꺼짐":(n?n+"개 숨김":"켜짐");
  if(em.textContent!==t)em.textContent=t;
}
function makePill(){
  if(!D.body)return;
  var pill=D.getElementById(PILL);
  if(!pill){
    pill=mk("div");pill.id=PILL;
    pill.setAttribute("role","button");pill.setAttribute("tabindex","0");
    pill.title="SocialLite · 탭하면 켜고 끄기 · 길게 누르면 진단";
    var dot=mk("span","sl-dot");pill.appendChild(dot);
    var b=mk("b");b.textContent="SL";pill.appendChild(b);
    var em=mk("em");em.textContent="켜짐";pill.appendChild(em);
    var lp=null;
    var press=function(){clearTimeout(lp);lp=setTimeout(function(){lp=null;openPanel();},650);};
    var release=function(){clearTimeout(lp);lp=null;};
    pill.addEventListener("pointerdown",function(e){e.stopPropagation();press();},true);
    pill.addEventListener("pointerup",function(e){e.stopPropagation();release();},true);
    pill.addEventListener("pointercancel",release,true);
    pill.addEventListener("touchstart",function(e){e.stopPropagation();},true);
    pill.addEventListener("mousedown",function(e){e.stopPropagation();},true);
    pill.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();setOn(!S.on);},true);
  }
  if(!pill.parentNode)D.body.appendChild(pill);
  paint();
}
function makeDm(){
  if(!D.body)return;
  if(/^\\/accounts\\//.test(W.location.pathname))return;   // no DM button on the login wall
  if(D.getElementById(DM))return;
  var a=mk("a");
  a.id=DM;a.href="/direct/inbox/";
  a.setAttribute("aria-label","DM 열기");
  a.title="DM 열기 · SocialLite";
  var NS="http://www.w3.org/2000/svg";
  var svg=D.createElementNS(NS,"svg");
  svg.setAttribute("viewBox","0 0 24 24");
  svg.setAttribute("aria-hidden","true");
  var path=D.createElementNS(NS,"path");
  path.setAttribute("d","M2.7 20.3 21 12 2.7 3.7l.1 6.2L15.4 12 2.8 14.1z");
  svg.appendChild(path);
  a.appendChild(svg);
  a.addEventListener("pointerdown",function(e){e.stopPropagation();},true);
  a.addEventListener("touchstart",function(e){e.stopPropagation();},true);
  a.addEventListener("click",function(e){e.stopPropagation();});
  D.body.appendChild(a);
}
function setOn(v){
  S.on=!!v;
  putOff(!S.on);
  if(!S.on){
    R.classList.add("sl-off");
    q('[data-sl="1"],[data-sl-tray="1"]').forEach(function(n){
      n.removeAttribute("data-sl");n.removeAttribute("data-sl-tray");
    });
    S.blocked=0;S.rules={};
    toast("SocialLite 꺼짐 · SL을 다시 누르면 켜져요");
  }else{
    R.classList.remove("sl-off");
    toast("SocialLite 켜짐");
    try{sweep();}catch(e){}
    if(isReels(W.location.pathname)){try{W.location.replace("/");}catch(e){}}
  }
  paint();
}
function openPanel(){
  var old=D.getElementById(PANEL);
  if(old){old.parentNode.removeChild(old);return;}
  if(!D.body)return;
  var p=mk("div");p.id=PANEL;
  var h=mk("h4");h.textContent="SocialLite 진단 · "+V;
  p.appendChild(h);
  function row(k,v,hl){
    var d=mk("div","sl-row");
    var s1=mk("span","sl-k");s1.textContent=k+": ";
    var s2=mk("span",hl?"sl-hl":"");s2.textContent=String(v);
    d.appendChild(s1);d.appendChild(s2);p.appendChild(d);
  }
  row("켜짐",S.on?"ON":"OFF");
  row("경로",W.location.pathname);
  row("숨김",shown());
  var c=counts();
  for(var k in c)row("· "+k,c[k]);
  var tabs=q('nav *,[role="navigation"] *,[role="tablist"] *');
  var n=0;
  for(var i=0;i<tabs.length&&n<14;i++){
    var t=txt(tabs[i]);
    if(!t||t.length>18)continue;
    var al=tabs[i].getAttribute("aria-label");
    row("["+(tabs[i].tagName||"")+" "+(tabs[i].getAttribute("role")||"")+"]",t+(al?" / "+al:""));
    n++;
  }
  if(!n)row("nav","(아직 없음)");
  var hh=D.querySelector('nav,[role="navigation"],[role="tablist"]');
  if(hh){
    var snip=String(hh.outerHTML||"").replace(/\\s+/g," ").slice(0,340);
    row("nav HTML",snip);
  }
  var btns=mk("div","sl-btns");
  var b1=mk("button");b1.textContent="다시 스캔";
  b1.onclick=function(){S.rules={};sweep();p.parentNode.removeChild(p);openPanel();};
  var b2=mk("button");b2.textContent="닫기";
  b2.onclick=function(){p.parentNode.removeChild(p);};
  btns.appendChild(b1);btns.appendChild(b2);p.appendChild(btns);
  D.body.appendChild(p);
}

var pending=false,obs=null;
function soon(){
  if(pending||!S.on)return;
  pending=true;
  setTimeout(function(){pending=false;try{sweep();guard();}catch(e){}},120);
}
function start(){
  if(!D.body){setTimeout(start,150);return;}
  if(S.ready)return;
  S.ready=true;
  if(getOff()){S.on=false;R.classList.add("sl-off");}else{R.classList.remove("sl-off");}
  makePill();
  try{makeDm();}catch(e){}
  try{sweep();}catch(e){}
  try{
    obs=new W.MutationObserver(soon);
    obs.observe(D.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["href","aria-label","role"]});
  }catch(e){obs=null;}
  setTimeout(function(){try{sweep();}catch(e){}},150);
  setTimeout(function(){try{sweep();}catch(e){}},500);
  setTimeout(function(){try{sweep();}catch(e){}},1200);
  setTimeout(function(){try{sweep();}catch(e){}},2500);
  setInterval(function(){if(S.on){try{sweep();guard();paint();}catch(e){}}},1200);
  W.addEventListener("scroll",soon,{passive:true});
  try{W.addEventListener("popstate",routeSoon);W.addEventListener("hashchange",routeSoon);}catch(e){}
  try{
    var HP=W.History&&W.History.prototype;
    if(HP){
      ["pushState","replaceState"].forEach(function(m){
        var o=HP[m];
        if(typeof o!=="function"||o.__sl)return;
        var f=function(){var r=o.apply(this,arguments);routeSoon();return r;};
        f.__sl=1;HP[m]=f;
      });
    }
  }catch(e){}
  try{D.addEventListener("click",clickGuard,true);}catch(e){}
  if(/[?&]sl_debug=1/.test(W.location.search))openPanel();
}
W.SL={
  v:V,
  status:function(){
    return {on:S.on,path:W.location.pathname,blocked:shown(),rules:counts(),off:getOff()};
  },
  scan:function(){S.rules={};try{sweep();}catch(e){}return S.rules;},
  marks:function(){return q('[data-sl="1"],[data-sl-tray="1"]').map(function(n){return n.tagName+" "+(n.getAttribute("aria-label")||"")+" "+(n.getAttribute("href")||"");});},
  panel:openPanel,
  on:function(){setOn(true);},
  off:function(){setOn(false);},
  toggle:function(){setOn(!S.on);}
};
try{start();}catch(e){try{console.warn("[SocialLite]",e);}catch(_){}}
})();
`;

module.exports = { CSS, JS };
