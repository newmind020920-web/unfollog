# Cloudflare Pages 로 올리기

사이트 주소를 `unfollog.pages.dev` 로 쓰기 위한 설정입니다.
집계 서버(Workers)와 같은 계정에 모입니다.

## 1. Pages 만들기

Cloudflare 대시보드 → **Workers & Pages** → `Create` → **Pages** 탭
→ **Connect to Git** → `newmind020920-web/unfollog` 선택

## 2. 빌드 설정

| 항목 | 값 |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (비움) |

## 3. 환경변수 — Build 쪽에 넣어야 합니다

**Settings → Build → Variables and secrets** 에서 추가합니다.

`Runtime variables and secrets` 는 다른 것입니다. 거기에 넣으면
"Variables cannot be added to a Worker that only has static assets" 가
뜹니다. VITE_API_URL 은 사이트를 **만들 때** 코드 안에 박히는 값이라,
다 만들어진 뒤에 주는 런타임 변수로는 아무 소용이 없습니다.

| 이름 | 값 |
| --- | --- |
| `VITE_API_URL` | `https://unfollog-api.newmind020920.workers.dev` |

제대로 들어갔는지는 빌드 로그에서 바로 보입니다.

    [unfollog] 방문 집계 켜짐 (주소 46자)
    [unfollog] 방문 집계 꺼짐 — VITE_API_URL 이 비어 있습니다

값 자체는 찍지 않습니다.

## 4. 집계 서버에 새 주소 알려주기 — 빠뜨리기 쉬움

배포가 끝나면 주소가 나옵니다. 그 주소를 Worker 에도 넣어야 합니다.

**Workers & Pages → unfollog-api → Settings → Variables and Secrets**

| 이름 | 바꿀 값 |
| --- | --- |
| `ALLOWED_ORIGIN` | `https://unfollog.pages.dev` |

끝에 `/` 를 붙이면 안 됩니다. 브라우저는 경로 없이 출처만 보냅니다.
이 값이 사이트 주소와 한 글자라도 다르면 서버가 403 으로 거절하고
집계가 멈춥니다.

## 5. 확인

1. `https://unfollog.pages.dev` 를 열어 봅니다.
2. 푸터에 "방문 횟수만 익명으로 세요" 가 있으면 3번이 반영된 것입니다.
3. `.../admin?key=...` 에서 전체 방문자가 올라가면 4번까지 끝난 것입니다.

## 주소가 바뀌면 사라지는 것

브라우저는 주소별로 따로 저장합니다. 옛 주소에 있던
스냅샷, '사라진 계정' 표시, 방문자 집계는 새 주소에서 보이지 않습니다.
파일을 다시 올리면 스냅샷은 복구됩니다.

## GitHub Pages 는 어떻게 하나

둘 다 켜 두면 같은 사이트가 두 주소에 뜨고, 각각 저장소가 달라
사용자가 헷갈립니다. Pages 가 잘 도는 것을 확인한 뒤
저장소 **Settings → Pages → Source** 를 `None` 으로 바꿔 끄세요.
그 뒤 `.github/workflows/deploy.yml` 은 지워도 됩니다.
