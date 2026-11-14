-- 방문자 한 명당 한 줄. 아이디는 브라우저가 만든 난수이고,
-- 누구인지 알 수 있는 정보는 넣지 않습니다.
CREATE TABLE IF NOT EXISTS visitor (
  code        TEXT PRIMARY KEY,
  first_at    INTEGER NOT NULL,   -- 처음 온 시각 (ms)
  last_at     INTEGER NOT NULL,   -- 마지막으로 온 시각
  visits      INTEGER NOT NULL DEFAULT 0,  -- 방문 횟수 (하루 1회만 셈)
  uploads     INTEGER NOT NULL DEFAULT 0,  -- 파일을 올린 횟수
  snapshots   INTEGER NOT NULL DEFAULT 0,  -- 가지고 있는 스냅샷 수
  last_day    TEXT,                         -- 마지막으로 센 날짜 (YYYY-MM-DD)
  host        TEXT,                         -- 들어온 주소 (미리보기 배포를 가려내기 위함)
  app         TEXT                          -- 브라우저 종류 (예: iOS 카톡). 전체 UA 는 받지 않음
);

CREATE INDEX IF NOT EXISTS visitor_last_at ON visitor (last_at);
CREATE INDEX IF NOT EXISTS visitor_visits ON visitor (visits);

-- 문의 한 건당 한 줄. 사람을 특정할 수 있는 것은 본인이 적어 준
-- 답장받을 곳(contact)뿐이고, 그것도 비워 둘 수 있습니다.
CREATE TABLE IF NOT EXISTS inquiry (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  code      TEXT,                -- 보낸 브라우저의 난수 코드 (방문 기록과 잇기 위함)
  at        INTEGER NOT NULL,    -- 보낸 시각 (ms)
  message   TEXT NOT NULL,       -- 문의 내용
  contact   TEXT,                -- 답장받을 곳. 적지 않으면 NULL
  meta      TEXT,                -- 본인이 동의했을 때만 담기는 분석 정보 (숫자와 파일 이름)
  done      INTEGER NOT NULL DEFAULT 0  -- 처리 완료 표시
);

CREATE INDEX IF NOT EXISTS inquiry_at ON inquiry (at);
