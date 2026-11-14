# 방문 집계 서버

Cloudflare Workers + D1. 무료 한도(하루 10만 요청) 안에서 충분히 돌아갑니다.

## 무엇을 저장하나

| 저장함 | 저장하지 않음 |
| --- | --- |
| 브라우저가 만든 난수 코드 (16자리) | 팔로워 목록 |
| 처음/마지막 방문 시각 | 인스타그램 아이디 |
| 방문 횟수 (하루 1회만 셈) | 전화번호·이메일 |
| 업로드 횟수, 스냅샷 개수 | IP 주소 |

코드는 브라우저가 스스로 만들어 `localStorage` 에 둡니다. 서버는 그 코드가
누구인지 알 방법이 없습니다. 브라우저 데이터를 지우면 새 코드가 발급됩니다.

`worker.js` 는 순수 자바스크립트입니다. Cloudflare 대시보드 편집기에 그대로
붙여넣을 수 있습니다. (타입 표기가 있으면 편집기가 전부 오류로 잡습니다.)

## 배포 — 브라우저에서 (CLI 없이)

1. **Storage & Databases → D1** → `Create` → 이름 `unfollog`
2. 만든 DB → **Console** 탭 → `schema.sql` 내용을 붙여넣고 실행
3. **Workers & Pages** → `Create` → Hello World → 이름 `unfollog-api` → Deploy
4. 만든 Worker → **Edit code** → 전부 지우고 `worker.js` 내용 붙여넣기 → Deploy
5. Worker → **Settings → Bindings** → `Add` → **D1 database**
   - Variable name `DB`, Database `unfollog`
6. 같은 화면 **Variables and Secrets**
   - `ALLOWED_ORIGIN` = 사이트 주소 (Text)
   - `ADMIN_KEY` = 길고 추측하기 어려운 값 (**Secret**)

## 배포 — 명령줄로

저장소 루트에도 `wrangler.jsonc` (사이트용) 가 있어서, 명령에
`--config wrangler.toml` 을 붙이지 않으면 그쪽을 집어갑니다.

```bash
cd server
npm i -D wrangler
npx wrangler login

# 1) 데이터베이스 만들기 → 출력된 database_id 를 wrangler.toml 에 적습니다
npx wrangler d1 create unfollog

# 2) 표 만들기
npx wrangler d1 execute unfollog --config wrangler.toml --remote --file=schema.sql

# 3) 관리자 열쇠 정하기 (길고 추측하기 어려운 값으로)
npx wrangler secret put ADMIN_KEY --config wrangler.toml

# 4) 올리기
npx wrangler deploy --config wrangler.toml
```

올리고 나면 `https://unfollog-api.<계정>.workers.dev` 주소가 나옵니다.

## 사이트에 연결

GitHub 저장소 → **Settings → Secrets and variables → Actions → Variables** 에서
`VITE_API_URL` 을 그 주소로 추가하고, 아무 커밋이나 푸시하면 반영됩니다.

**이 값이 없으면 사이트는 아무것도 보내지 않습니다.** 빌드할 때 집계 코드
자체가 번들에서 빠집니다.

## 방문 현황 보기

```
https://unfollog-api.<계정>.workers.dev/admin?key=<ADMIN_KEY>
```

보이는 숫자:

표에는 들어온 순서대로 번호(00001…)가 붙습니다. 번호에 마우스를
올리면 실제 코드가 보입니다.

- **전체 방문자** — 코드를 받은 브라우저 수
- **2번 이상 온 사람 / 재방문율** — 다시 찾아오는지
- **파일을 올린 사람** — 실제로 써 본 사람
- **두 번 이상 올린 사람** — 언팔 결과를 실제로 본 사람.
  구독이 성립하는지 보여주는 가장 중요한 숫자입니다.

열쇠는 Workers 비밀값에만 있고 공개 저장소에는 들어가지 않습니다.

## 숫자를 읽을 때

- 같은 사람이 폰과 PC에서 열면 **둘로 셉니다.** 기기별 코드라 그렇습니다.
- 브라우저 데이터를 지우면 새 사람으로 잡힙니다.
- 그래서 실제 사람 수보다 조금 많게 나옵니다. 재방문율은 반대로 낮게 나옵니다.
- 시크릿 창에서는 집계되지 않습니다.
