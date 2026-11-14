# Cloudflare 에 사이트 올리기

집계 서버(`unfollog-api`)와 같은 계정에, 사이트를 `unfollog` 라는
이름으로 올립니다. 주소는 `https://unfollog.<계정>.workers.dev` 입니다.

사이트는 코드가 도는 서버가 아니라 빌드 결과(`dist`)를 그대로
내보내기만 합니다. 설정은 저장소 루트의 `wrangler.jsonc` 에 있습니다.

## 1. 저장소 연결

**Workers & Pages** → `Create` → Git 저장소 연결 → `newmind020920-web/unfollog`

## 2. 빌드 설정

| 항목 | 값 |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

## 3. Build variables — Runtime 아님

**Settings → Build → Build variables** 에 넣습니다.

| 이름 | 값 |
| --- | --- |
| `VITE_API_URL` | `https://unfollog-api.newmind020920.workers.dev` |

`Runtime variables and secrets` 는 다른 것입니다. 거기에 넣으면
"Variables cannot be added to a Worker that only has static assets" 가
뜹니다. 이 값은 사이트를 **만들 때** 코드 안에 박히는 값이라,
다 만들어진 뒤에 주는 런타임 변수로는 소용이 없습니다.

제대로 들어갔는지는 빌드 로그에서 바로 보입니다.

    [unfollog] 방문 집계 켜짐 (주소 46자)
    [unfollog] 방문 집계 꺼짐 — VITE_API_URL 이 비어 있습니다

값 자체는 찍지 않습니다.

## 4. 집계 서버에 새 주소 알려주기 — 빠뜨리기 쉬움

**Workers & Pages → unfollog-api → Settings → Variables and Secrets**

| 이름 | 바꿀 값 |
| --- | --- |
| `ALLOWED_ORIGIN` | `https://unfollog.<계정>.workers.dev` |

끝에 `/` 를 붙이면 안 됩니다. 브라우저는 경로 없이 출처만 보냅니다.
사이트 주소와 한 글자라도 다르면 서버가 403 으로 거절하고 집계가
조용히 멈춥니다.

(집계 서버는 코드가 도는 Worker 라서, 여기는 Runtime 변수가 맞습니다.)

## 5. 확인

1. 사이트 주소를 엽니다.
2. 푸터에 "방문 횟수만 익명으로 세요" 가 있으면 3번이 반영된 것입니다.
3. `.../admin?key=...` 에서 전체 방문자가 올라가면 4번까지 끝입니다.

## 주소가 바뀌면 사라지는 것

브라우저는 주소별로 따로 저장합니다. 옛 주소에 있던 스냅샷,
'사라진 계정' 표시, 방문자 집계는 새 주소에서 보이지 않습니다.
파일을 다시 올리면 스냅샷은 복구됩니다.

## GitHub Pages 는 어떻게 하나

둘 다 켜 두면 같은 사이트가 두 주소에 뜨고, 저장소가 분리돼 있어
사용자가 헷갈립니다. 새 주소가 잘 도는 것을 확인한 뒤 저장소
**Settings → Pages → Source** 를 `None` 으로 바꿔 끄고,
`.github/workflows/deploy.yml` 을 지우면 됩니다.
