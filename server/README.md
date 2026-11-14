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
- **안 읽은 문의** — 아직 처리함으로 표시하지 않은 문의 수

열쇠는 Workers 비밀값에만 있고 공개 저장소에는 들어가지 않습니다.

## 이미 돌고 있는 DB 를 고칠 때

`schema.sql` 은 처음 만들 때만 씁니다. 이미 쓰고 있는 DB 에는
`migrate-2026-11-14.sql` 을 D1 Console 에 붙여넣으세요. 문의 테이블과
방문자의 주소·브라우저 칸이 생깁니다.

`duplicate column name` 이 나오면 이미 있다는 뜻이니 넘어가면 됩니다.

**worker.js 도 새로 붙여넣어 배포해야 합니다.** Pages 와 달리 Worker 는
자동으로 올라가지 않습니다. 올리지 않으면 방문 집계만 되고 문의는 404 가
되는데, 그때 문의 화면에 "문의 창구가 아직 서버에 올라가지 않았어요" 가
뜹니다.

## 문의

같은 화면 위쪽에 들어온 문의가 최근 순으로 쌓입니다. 아직 안 읽은 것은
왼쪽에 빨간 줄이 붙고, **처리함으로** 를 누르면 표시가 바뀝니다.

한 건에 들어 있는 것:

- 본문 (최대 2,000자)
- 답장받을 곳 — 보낸 사람이 적었을 때만. 비워도 보낼 수 있습니다.
- 숫자 요약 — 보낸 사람이 체크를 켜 두었을 때만. 팔로워·팔로잉 수, 읽은
  파일 이름과 인원, 파일이 담고 있는 기간, 스냅샷 수, 브라우저 종류입니다.
  "숫자가 이상해요" 문의는 이것 없이는 답할 수 없어서 기본으로 켜 두되,
  무엇이 담기는지 폼에 그대로 보여주고 끌 수 있게 했습니다.

팔로워 목록과 아이디는 어떤 경우에도 보내지 않습니다.

같은 브라우저에서 1분 안에 두 번 보내면 두 번째는 받지 않습니다(429).
본문이 비어 있으면 400, 다른 사이트에서 보내면 403 입니다.

## 숫자를 읽을 때

표의 **주소**와 **브라우저** 칸을 먼저 보세요. 숫자가 실제 사람 수보다
많아 보이는 이유가 거기 다 있습니다.

- **주소가 `*.unfollog.pages.dev` 처럼 앞에 뭐가 붙어 있으면** 미리보기 배포입니다.
  Cloudflare 는 배포할 때마다 따로 주소를 만들고, 코드는 주소마다 새로 생깁니다.
  같은 사람이 미리보기와 진짜 주소를 오가면 둘로 세어집니다.
- **브라우저가 `카톡`·`인스타`** 면 인앱 브라우저입니다. 같은 폰이라도 사파리와
  따로 세어집니다. 링크를 카톡으로 보내 열어 보셨다면 거의 여기에 해당합니다.
- 같은 사람이 폰과 PC에서 열면 **둘로 셉니다.** 기기별 코드라 그렇습니다.
- 브라우저 데이터를 지우면 새 사람으로 잡힙니다.
- 그래서 실제 사람 수보다 조금 많게 나옵니다. 재방문율은 반대로 낮게 나옵니다.
- 시크릿 창에서는 집계되지 않습니다.
