# SocialLite Proxy (Vercel)

인스타그램 웹을 **Vercel 서버리스 리버스 프록시**로 감싸서, 홈 화면에 추가한 `*.vercel.app` 앱 안에서
**릴스만 사라진 인스타그램**이 열리게 하는 버전입니다. 북마클릿·유저스크립트·확장 프로그램이 필요 없습니다.

```
iPhone 홈 화면 앱 (vercel.app)
        │
        ▼
  Vercel: vercel.json  ──(모든 경로 rewrite)──▶  api/proxy.js
                                                    │  ├─ HTML: 오리진 재작성 + SocialLite 주입
                                                    │  ├─ JS  : 오리진 재작성 (CORS 실패 방지)
                                                    │  └─ 그 외: 그대로 스트리밍
                                                    ▼
                                        https://www.instagram.com
```

## 왜 프록시인가

인스타그램 앱 내부는 고칠 수 없고, 사파리에서 `instagram.com`을 열면 도메인이 `instagram.com`이라
우리 CSS/JS를 넣을 수 없습니다. 프록시는 **우리 도메인에서 인스타그램 HTML을 받아** 그 자리에서
(1) 릴스 차단 코드를 심고 (2) 쿠키·리다이렉트를 우리 도메인 기준으로 고쳐서 내려줍니다.
그래서 홈 화면 앱으로 열어도 처음부터 릴스가 없는 화면이 나옵니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `vercel.json` | 모든 경로를 `api/proxy.js`로 rewrite, 함수 설정(maxDuration 30s) |
| `api/proxy.js` | 프록시 본체. 요청 전달, 헤더/쿠키/Location 재작성, HTML·JS 재작성, `/sl/*` 엔드포인트 |
| `lib/html.js` | HTML 변환(오리진 재작성 → 매니페스트 교체 → `<head>` 주입) |
| `lib/blocker.js` | 주입되는 CSS/JS (릴스 차단 엔진 + SL 알약 + DM 버튼 + 진단 패널) |
| `lib/assets.js` | 매니페스트 + 아이콘(PNG, base64 내장 — 외부 파일 의존 없음) |
| `dev/` | 로컬 테스트 하네스 (배포에는 영향 없음) |

`public/` 디렉터리는 **일부러 두지 않았습니다.** 정적 파일이 함수보다 먼저 매칭되면 인스타그램 경로와
충돌할 수 있어서, 매니페스트·아이콘·진단 페이지도 전부 함수에서 내려줍니다.

## 배포

Vercel 계정 로그인이 필요합니다(아래 3가지 중 하나).

**1) 대시보드에서 GitHub 저장소 연결 (권장)**
1. `tj-jiub/avoid_doomscroll`에 이 폴더(`apps/socialite-proxy/`) 내용을 푸시 — 또는 새 저장소 생성
2. vercel.com → **Add New… → Project → Import Git Repository** → 해당 저장소 선택
3. Framework Preset: **Other**, Root Directory: 저장소 루트(또는 `apps/socialite-proxy`), Build Command 비움
4. **Deploy** → `https://<프로젝트>.vercel.app`

**2) Vercel CLI**
```sh
cd apps/socialite-proxy
npx vercel login      # 이메일/GitHub 인증 (사람이 한 번)
npx vercel --prod
```

**3) 드래그 앤 드롭**
`socialite-proxy-vercel.zip`(이 폴더에 함께 생성)을 vercel.com/new 의 업로드 영역에 끌어다 놓습니다.

배포 직후 확인: `https://<주소>/sl/diag` → `resolvedPath`가 `/sl/diag`로 나오면 rewrite가 정상입니다.

## 아이폰 홈 화면에 추가

1. 사파리에서 `https://<프로젝트>.vercel.app` 열기
2. 공유 → **홈 화면에 추가** (이름: SocialLite)
3. 홈 화면 아이콘으로 실행 → 주소창 없이 standalone으로 열립니다
4. 인스타그램 로그인 (프록시 도메인에 쿠키가 저장됩니다)

## 무엇을 하나

- **HTML**: `https://www.instagram.com/…` → `/…`, `https://static.cdninstagram.com/…` → `/sl-cdn/…`
- **헤더**: `X-Frame-Options`, `Content-Security-Policy`(+report-only), `COOP/COEP/CORP`,
  `Permissions-Policy`, `Report-To`, `NEL` 제거 → standalone에서 인라인 코드가 그대로 동작
- **리다이렉트**: `Location`의 인스타그램 절대 URL을 상대 경로로 (`next=` 파라미터 포함)
- **쿠키**: `Domain` 제거(호스트 전용), `SameSite=None` → `Lax`, `Path`/`Secure` 보정
  → 세션 쿠키가 `*.vercel.app`에 남고, 우리 프록시가 그대로 인스타그램에 전달
- **주입**: 매니페스트·apple-touch-icon·`apple-mobile-web-app-capable` 메타, 릴스 차단 CSS/JS
- **서버사이드 차단**: `/reels`, `/reels/*` → `302 /` (SL을 끄면 `sl_off=1` 쿠키로 통과)

## 릴스 차단 엔진 (모바일 웹 실제 DOM 대응)

해시 클래스(`x1abc…`)는 쓰지 않고 **href · aria-label · 화면 텍스트 · role**만 봅니다.

| 잡는 대상 | 방법 |
| --- | --- |
| 하단/상단 탭의 릴스 | `a[href$="/reels"]`, `[aria-label*="릴스"/"reels" i]`, `role=tab` 안의 텍스트 `릴스`·`Reels` |
| href 없는 텍스트 탭 | `nav *` / `[role=navigation] *` / `[role=tablist] *` 를 훑어 텍스트가 정확히 `릴스`인 노드를 탭 아이템까지 끌어올려 숨김 |
| 피드의 릴스 카드 | `/reel/…` 링크의 `article` → 없으면 카드 래퍼(`role=link`)까지 끌어올림 |
| 추천 릴스 트레이 | 링크 중 75% 이상이 `/reel/`이고 3개 이상인 컨테이너 |
| 탐색 그리드의 릴스 칸 | 칸 단위로만 숨김(사진 칸은 유지) |
| 라우팅 | `pushState/replaceState/popstate/hashchange` 훅 + 1.2초 주기 경로 검사 → `/reels/`면 되돌림 |
| 클릭 | 캡처 단계에서 href·aria-label·텍스트를 확인해 릴스 진입 차단 |

동작 확인용 UI:

- **SL 알약**(왼쪽 아래): 탭 = 켜기/끄기(쿠키·localStorage에 기억), **길게 누르기(0.65초) = 진단 패널**
- **DM 버튼**(오른쪽 위): 언제나 `/direct/inbox/`로 이동 (하단 탭이 가려져도 DM 접근)
- 진단 패널: 현재 경로, 숨긴 개수/규칙별 카운트, 인식한 nav 항목, nav HTML 앞부분 → 안 되면 이 화면을 캡처
- `window.SL.status()`, `window.SL.scan()`, `window.SL.marks()`, `?sl_debug=1`

## 로컬 테스트

Node 18+ 만 있으면 됩니다(의존성 없음).

```sh
cd apps/socialite-proxy
node dev/server.js            # http://127.0.0.1:3000  (Vercel rewrite와 동일하게 req.url 유지)
# 다른 터미널
python3 dev/test_proxy.py     # 실제 instagram.com 대상 (390x844)
python3 dev/test_blocker.py   # 로그인 상태 모바일 DOM 픽스처
python3 dev/test_login.py     # CSRF 쿠키 + 로그인 POST 왕복
python3 dev/check_syntax.py   # 주입 코드가 Chromium에서 파싱되는지
```

## 알려진 한계 (2026-11-27 로컬 실측)

- **Meta의 데이터센터 IP 차단**: 이 샌드박스에서는 `/accounts/login/`·`/`가 간헐적으로 **429**,
  로그인 POST가 한 번 **500**(재시도 시 200 JSON)을 돌려줬습니다. Vercel(AWS) IP에서도 같은 일이
  일어날 수 있고, 그때는 "너무 많은 요청" 화면이 뜹니다. 프록시 문제가 아니라 인스타그램 쪽 제한입니다.
- **로그인 상태 화면은 실측하지 못했습니다.** 계정이 없어 홈 피드/하단 탭 실물 DOM을 확인할 수 없었고,
  대신 실제 모바일 DOM 구조를 재현한 픽스처로 검증했습니다(24/24, 실제 페이지 검사 14/14). 첫 사용 때 SL 알약 길게 눌러
  진단 패널을 한 번 확인하는 걸 권합니다.
- **세션은 배포 도메인에만** 있습니다. `instagram.com`과 로그인이 공유되지 않고, 배포 주소가 바뀌면
  다시 로그인해야 합니다.
- 인스타그램은 프록시 열람을 권장하지 않습니다. 개인 계정으로만 쓰고, 로그인 챌린지(코드 확인)가
  뜨면 인스타그램 앱에서 승인하면 됩니다.
