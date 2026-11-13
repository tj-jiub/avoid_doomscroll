/* SocialLite 테스트 픽스처 — 인스타그램 웹의 구조를 흉내 낸 가짜 DOM.
 * 실제 인스타그램이 쓰는 해시 클래스(x1abc)는 재현하지 않는다.
 * 우리 셀렉터가 의존하는 신호(href · aria-label · role · 태그 구조 · 문구)만 그대로 둔다.
 */
(function (root) {
  "use strict";

  function svg(label) {
    return '<svg aria-label="' + label + '" role="img" viewBox="0 0 24 24" width="24" height="24"></svg>';
  }

  function navMobile() {
    return (
      '<div role="navigation" aria-label="기본 탐색" data-test="nav-mobile">' +
      '<a href="/" aria-label="홈">' + svg("Home") + "</a>" +
      '<a href="/explore/" aria-label="탐색">' + svg("Search") + "</a>" +
      '<a href="/reels/" role="link" tabindex="0" data-test="nav-reels">' + svg("Reels") + "</a>" +
      '<a href="/direct/inbox/" aria-label="메시지">' + svg("Messenger") + "</a>" +
      '<a href="/" aria-label="프로필"><img alt="" width="24" height="24"></a>' +
      "</div>"
    );
  }

  function navDesktop() {
    return (
      '<div role="navigation" aria-label="기본 탐색" data-test="nav-desktop">' +
      '<a href="/" data-test="desk-home">' + svg("Home") + "<span>홈</span></a>" +
      '<a href="/explore/" data-test="desk-explore">' + svg("Search") + "<span>탐색</span></a>" +
      '<a href="/reels/" data-test="desk-reels">' + svg("Reels") + "<span>Reels</span></a>" +
      '<a href="/direct/inbox/" data-test="desk-dm">' + svg("Messenger") + "<span>메시지</span></a>" +
      "</div>"
    );
  }

  function storyTray() {
    var items = "";
    for (var i = 1; i <= 6; i++) {
      items +=
        '<div data-test="story-' + i + '"><a href="/stories/friend' + i + "/" + i + '/">' +
        '<img alt="friend' + i + '" width="56" height="56"></a><span>friend' + i + "</span></div>";
    }
    return '<div data-test="story-tray" role="group" aria-label="스토리">' + items + "</div>";
  }

  function postPhoto(id) {
    return (
      '<article data-test="post-photo-' + id + '">' +
      '<header><a href="/friend' + id + '/"><img alt="" width="32" height="32"></a>' +
      "<span>friend" + id + "</span></header>" +
      '<div><img alt="사진 게시물" width="400" height="400" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>' +
      '<div><span>좋아요 12개</span><div>오늘도 사진 한 장</div></div>' +
      "</article>"
    );
  }

  function postVideo(id) {
    return (
      '<article data-test="post-video-' + id + '">' +
      '<header><a href="/friend' + id + '/"><img alt=""></a><span>friend' + id + "</span></header>" +
      '<div><a href="/p/VID' + id + '/"><video src="" autoplay muted playsinline width="400" height="400"></video></a></div>' +
      '<div><span>좋아요 3개</span><div>일반 동영상 게시물</div></div>' +
      "</article>"
    );
  }

  function postReel(code) {
    return (
      '<article data-test="post-reel-' + code + '">' +
      '<header><span>friend9</span><svg aria-label="Reels" role="img" width="16" height="16"></svg></header>' +
      '<div><a href="/reel/' + code + '/"><video src="" autoplay muted loop playsinline width="400" height="500"></video></a></div>' +
      '<div><span>좋아요 1.2만개</span></div>' +
      "</article>"
    );
  }

  function postAd() {
    return (
      '<article data-test="post-ad">' +
      '<header><span>brand_kr</span><span>Sponsored</span></header>' +
      '<img alt="광고" width="400" height="300">' +
      "</article>"
    );
  }

  function suggestedCarousel() {
    return (
      '<div data-test="suggested">' +
      "<h2>Suggested for you</h2>" +
      '<div role="group">' +
      '<a href="/p/SUG1/"><img alt="" width="120" height="120"></a>' +
      '<a href="/p/SUG2/"><img alt="" width="120" height="120"></a>' +
      "</div></div>"
    );
  }

  function reelsTray() {
    var items = "";
    for (var i = 1; i <= 4; i++) {
      items += '<div><a href="/reel/TRAY' + i + '/"><video src="" autoplay muted playsinline></video></a></div>';
    }
    return '<div data-test="reels-tray" role="group" aria-label="Reels">' + items + "</div>";
  }

  function feed(opts) {
    var o = opts || {};
    return (
      (o.desktop ? navDesktop() : "") +
      "<main>" +
      (o.desktop ? "" : navMobile()) +
      '<div data-test="feed">' +
      storyTray() +
      postPhoto(1) +
      (o.withReels === false ? "" : postReel("ABC123")) +
      postVideo(2) +
      (o.withReels === false ? "" : reelsTray()) +
      (o.withSuggested === false ? "" : suggestedCarousel()) +
      postPhoto(3) +
      postAd() +
      "</div></main>"
    );
  }

  function direct() {
    var threads = "";
    var names = ["지우", "민서", "준", "하늘"];
    for (var i = 0; i < names.length; i++) {
      threads +=
        '<div role="listitem" data-test="thread-' + i + '">' +
        '<a href="/direct/t/100' + i + '/"><img alt="" width="44" height="44"><span>' + names[i] + "</span></a>" +
        "<div>어제 보낸 메시지</div></div>";
    }
    return (
      navMobile() +
      "<main><div data-test=\"dm-list\" role=\"list\">" + threads +
      '<div role="listitem" data-test="thread-shared-reel">' +
      '<a href="/direct/t/1009/"><img alt=""><span>수아</span></a>' +
      '<div><a href="/reel/SHARED9/" data-test="dm-shared-reel"><video src="" playsinline></video>' +
      "<span>이거 봐 ㅋㅋ</span></a></div></div>" +
      "</div>" +
      '<div data-test="dm-thread"><div role="list" data-test="dm-messages">' +
      '<div data-test="dm-msg-1"><span>안녕!</span></div>' +
      '<div data-test="dm-msg-2"><a href="/reel/SHARED9/" data-test="dm-msg-reel"><video src="" playsinline></video></a></div>' +
      "</div>" +
      '<form data-test="dm-composer"><textarea placeholder="메시지 입력..."></textarea><button type="submit">보내기</button></form>' +
      "</div></main>"
    );
  }

  function storiesViewer() {
    return (
      "<main><div role=\"dialog\" aria-label=\"스토리\" data-test=\"story-viewer\">" +
      '<video src="" autoplay muted playsinline data-test="story-video"></video>' +
      '<button aria-label="Next" data-test="story-next">다음</button>' +
      "</div></main>"
    );
  }

  function profile() {
    var tiles = "";
    for (var i = 1; i <= 9; i++) {
      tiles += '<a href="/p/P' + i + '/" data-test="tile-' + i + '"><img alt="" width="120" height="120"></a>';
    }
    tiles += '<a href="/reel/MYREEL1/" data-test="tile-myreel"><img alt="" width="120" height="120"></a>';
    return (
      navMobile() +
      "<main>" +
      '<header data-test="profile-head"><img alt=""><h1>jiwoo</h1></header>' +
      '<div role="tablist" data-test="profile-tabs">' +
      '<a href="/jiwoo/" data-test="tab-posts">게시물</a>' +
      '<a href="/jiwoo/reels/" data-test="tab-reels">릴스</a>' +
      '<a href="/jiwoo/saved/" data-test="tab-saved">저장됨</a>' +
      "</div>" +
      '<div data-test="profile-grid">' + tiles + "</div>" +
      "</main>"
    );
  }

  function explore() {
    var cells = "";
    for (var i = 1; i <= 4; i++) cells += '<a href="/p/E' + i + '/" data-test="cell-photo-' + i + '"><img alt=""></a>';
    for (var j = 1; j <= 3; j++) {
      cells += '<a href="/reel/EXP' + j + '/" data-test="cell-reel-' + j + '">' +
        '<video src="" autoplay muted playsinline></video></a>';
    }
    return navMobile() + '<main><div data-test="explore-grid">' + cells + "</div></main>";
  }

  function singleReel(code) {
    return (
      navMobile() +
      '<main data-test="reel-page">' +
      '<article data-test="reel-primary"><a href="/reel/' + code + '/"><video src="" autoplay muted playsinline></video></a>' +
      "<div>좋아요 8천개</div></article>" +
      '<button aria-label="Previous" data-test="reel-prev"><svg aria-label="Previous"></svg></button>' +
      '<button aria-label="Next" data-test="reel-next"><svg aria-label="Next"></svg></button>' +
      '<div data-test="reel-suggestions">' +
      '<a href="/reel/OTHER1/" data-test="reel-sug-1"><video src=""></video></a>' +
      '<a href="/reel/OTHER2/" data-test="reel-sug-2"><video src=""></video></a>' +
      "</div></main>"
    );
  }

  root.SLFixtures = {
    svg: svg,
    navMobile: navMobile,
    navDesktop: navDesktop,
    storyTray: storyTray,
    postPhoto: postPhoto,
    postVideo: postVideo,
    postReel: postReel,
    postAd: postAd,
    suggestedCarousel: suggestedCarousel,
    reelsTray: reelsTray,
    feed: feed,
    direct: direct,
    storiesViewer: storiesViewer,
    profile: profile,
    explore: explore,
    singleReel: singleReel
  };
})(typeof window !== "undefined" ? window : this);
