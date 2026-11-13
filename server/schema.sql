-- 방문자 한 명당 한 줄. 아이디는 브라우저가 만든 난수이고,
-- 누구인지 알 수 있는 정보는 넣지 않습니다.
CREATE TABLE IF NOT EXISTS visitor (
  code        TEXT PRIMARY KEY,
  first_at    INTEGER NOT NULL,   -- 처음 온 시각 (ms)
  last_at     INTEGER NOT NULL,   -- 마지막으로 온 시각
  visits      INTEGER NOT NULL DEFAULT 0,  -- 방문 횟수 (하루 1회만 셈)
  uploads     INTEGER NOT NULL DEFAULT 0,  -- 파일을 올린 횟수
  snapshots   INTEGER NOT NULL DEFAULT 0,  -- 가지고 있는 스냅샷 수
  last_day    TEXT                          -- 마지막으로 센 날짜 (YYYY-MM-DD)
);

CREATE INDEX IF NOT EXISTS visitor_last_at ON visitor (last_at);
CREATE INDEX IF NOT EXISTS visitor_visits ON visitor (visits);
