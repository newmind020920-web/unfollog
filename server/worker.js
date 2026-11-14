/**
 * 언팔로그 방문 집계 서버 (Cloudflare Workers + D1)
 *
 * 받는 것: 브라우저가 만든 난수 코드, 방문/업로드 여부, 스냅샷 개수.
 * 받지 않는 것: 팔로워 목록, 아이디, 전화번호, IP 저장.
 *
 *   POST /v      방문·업로드 기록
 *   POST /q      문의 접수
 *   GET  /admin  관리자 화면 (ADMIN_KEY 필요)
 *
 * Cloudflare 편집기에 그대로 붙여넣을 수 있도록 순수 자바스크립트로 씁니다.
 *
 * @typedef {{ DB: D1Database, ADMIN_KEY: string, ALLOWED_ORIGIN: string }} Env
 */

const CODE_RE = /^[0-9a-f]{16}$/

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  }
}

/** 서버 시각 기준 한국 날짜. 하루 한 번만 세기 위한 기준입니다. */
function todayKST(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10)
}

async function recordVisit(env, body) {
  const b = body || {}
  const code = typeof b.code === 'string' ? b.code : ''
  if (!CODE_RE.test(code)) return new Response('bad code', { status: 400 })

  const uploaded = b.uploaded === true
  const snapshots = Number.isInteger(b.snapshots) ? Math.min(Number(b.snapshots), 9999) : 0
  const now = Date.now()
  const day = todayKST(now)

  // 방문은 하루에 한 번만 셉니다. 새로고침으로 숫자가 부풀지 않게.
  await env.DB.prepare(
    `INSERT INTO visitor (code, first_at, last_at, visits, uploads, snapshots, last_day)
     VALUES (?1, ?2, ?2, 1, ?3, ?4, ?5)
     ON CONFLICT(code) DO UPDATE SET
       last_at   = ?2,
       visits    = visits + (CASE WHEN last_day IS ?5 THEN 0 ELSE 1 END),
       uploads   = uploads + ?3,
       snapshots = MAX(snapshots, ?4),
       last_day  = ?5`,
  )
    .bind(code, now, uploaded ? 1 : 0, snapshots, day)
    .run()

  return new Response(null, { status: 204 })
}

/** 글자 수를 자릅니다. 길이를 서버에서 막지 않으면 데이터베이스가 쓰레기로 찹니다. */
function clip(v, max) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max) : t
}

async function recordInquiry(env, body) {
  const b = body || {}
  const message = clip(b.message, 2000)
  if (!message) return new Response('empty', { status: 400 })

  const code = typeof b.code === 'string' && CODE_RE.test(b.code) ? b.code : null
  const contact = clip(b.contact, 200)
  const meta = clip(b.meta, 500)
  const now = Date.now()

  // 같은 브라우저가 1분 안에 또 보내면 받지 않습니다. 눌림 방지 겸 도배 방지.
  if (code) {
    const recent = await env.DB.prepare(
      `SELECT at FROM inquiry WHERE code = ?1 ORDER BY at DESC LIMIT 1`,
    )
      .bind(code)
      .first()
    if (recent && now - Number(recent.at) < 60_000) {
      return new Response('too soon', { status: 429 })
    }
  }

  await env.DB.prepare(
    `INSERT INTO inquiry (code, at, message, contact, meta) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(code, now, message, contact, meta)
    .run()

  return new Response(null, { status: 204 })
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

async function adminPage(env) {
  const totals = await env.DB.prepare(
    `SELECT
       COUNT(*)                                     AS people,
       SUM(CASE WHEN visits >= 2 THEN 1 ELSE 0 END)   AS returned,
       SUM(CASE WHEN uploads >= 1 THEN 1 ELSE 0 END)  AS uploaded,
       SUM(CASE WHEN snapshots >= 2 THEN 1 ELSE 0 END) AS compared
     FROM visitor`,
  ).first()

  // rowid 는 들어온 순서대로 붙는 번호입니다. 긴 난수 코드 대신 이걸 보여줍니다.
  const rows = await env.DB.prepare(
    `SELECT rowid AS seq, code, first_at, last_at, visits, uploads, snapshots
     FROM visitor ORDER BY last_at DESC LIMIT 200`,
  ).all()

  const inquiries = await env.DB.prepare(
    `SELECT id, code, at, message, contact, meta, done
     FROM inquiry ORDER BY at DESC LIMIT 100`,
  ).all()
  const openCount = inquiries.results.filter((q) => !q.done).length

  const people = Number((totals && totals.people) || 0)
  const returned = Number((totals && totals.returned) || 0)
  const compared = Number((totals && totals.compared) || 0)
  const uploadedPeople = Number((totals && totals.uploaded) || 0)
  const pct = (n) => (people ? `${Math.round((n / people) * 100)}%` : '—')
  const fmt = (ms) => new Date(Number(ms)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const no = (n) => String(n).padStart(5, '0')

  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>언팔로그 · 방문 현황</title>
<style>
 body{margin:0;padding:24px 16px;background:#f2f4f6;color:#191f28;
      font-family:-apple-system,BlinkMacSystemFont,system-ui,'Malgun Gothic',sans-serif;
      letter-spacing:-0.01em}
 .wrap{max-width:900px;margin:0 auto}
 h1{font-size:22px;margin:0 0 16px}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:22px}
 .c{background:#fff;border-radius:16px;padding:16px}
 .c .n{font-size:28px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums}
 .c .l{font-size:13px;color:#6b7684}
 .c .s{font-size:12px;color:#8b95a1;margin-top:2px}
 table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;font-size:13px}
 th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #f0f2f4;font-variant-numeric:tabular-nums}
 th{background:#f9fafb;font-size:12px;color:#6b7684;font-weight:600}
 tr:last-child td{border:0}
 code{font-family:ui-monospace,monospace;color:#6b7684}
 .hint{font-size:12px;color:#8b95a1;margin-top:14px;line-height:1.6}
 .funnel{background:#fff;border-radius:16px;padding:16px;margin-bottom:22px;font-size:15px;
         font-variant-numeric:tabular-nums}
 .funnel b{font-size:19px;margin:0 2px}
 .funnel i{color:#6b7684;font-style:normal;font-size:13px}
 .funnel .ar{color:#b0b8c1;margin:0 8px}
 h2{font-size:17px;margin:28px 0 12px}
 .q{background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:8px}
 .q.open{border-left:4px solid #f04452}
 .q .top{display:flex;gap:8px;align-items:baseline;font-size:12px;color:#8b95a1;margin-bottom:6px;flex-wrap:wrap}
 .q .msg{font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
 .q .re{font-size:13px;color:#191f28;margin-top:8px;background:#f2f4f6;border-radius:10px;padding:8px 10px;
        word-break:break-all}
 .q .meta{font-size:12px;color:#8b95a1;margin-top:6px}
 .q form{margin-top:10px}
 .q button{font:inherit;font-size:12px;border:0;border-radius:8px;padding:6px 10px;cursor:pointer;
           background:#f2f4f6;color:#6b7684}
 .none{background:#fff;border-radius:16px;padding:18px;color:#8b95a1;font-size:14px}
</style></head><body><div class="wrap">
<h1>언팔로그 · 방문 현황</h1>
<div class="cards">
  <div class="c"><div class="l">전체 방문자</div><div class="n">${people}</div></div>
  <div class="c"><div class="l">파일을 올린 사람</div><div class="n">${uploadedPeople}</div><div class="s">방문자의 ${pct(uploadedPeople)}</div></div>
  <div class="c"><div class="l">두 번 이상 올린 사람</div><div class="n">${compared}</div><div class="s">방문자의 ${pct(compared)} · 언팔을 본 사람</div></div>
  <div class="c"><div class="l">2번 이상 온 사람</div><div class="n">${returned}</div><div class="s">재방문율 ${pct(returned)}</div></div>
  <div class="c"><div class="l">안 읽은 문의</div><div class="n">${openCount}</div><div class="s">전체 ${inquiries.results.length}건</div></div>
</div>

<div class="funnel">
  방문 <b>${people}</b>
  <span class="ar">→</span> 업로드 <b>${uploadedPeople}</b> <i>${pct(uploadedPeople)}</i>
  <span class="ar">→</span> 두 번 업로드 <b>${compared}</b> <i>${pct(compared)}</i>
</div>
<h2>문의 ${openCount ? `· 안 읽음 ${openCount}건` : ''}</h2>
${
  inquiries.results.length
    ? inquiries.results
        .map(
          (q) => `<div class="q${q.done ? '' : ' open'}">
  <div class="top"><b>#${q.id}</b><span>${fmt(q.at)}</span>${q.code ? `<span>방문자 ${escapeHtml(String(q.code)).slice(0, 8)}…</span>` : ''}${q.done ? '<span>처리함</span>' : ''}</div>
  <div class="msg">${escapeHtml(String(q.message))}</div>
  ${q.contact ? `<div class="re">답장받을 곳: ${escapeHtml(String(q.contact))}</div>` : ''}
  ${q.meta ? `<div class="meta">${escapeHtml(String(q.meta))}</div>` : ''}
  <form method="POST" action="/admin/done?key=${encodeURIComponent(env.ADMIN_KEY)}">
    <input type="hidden" name="id" value="${q.id}">
    <input type="hidden" name="to" value="${q.done ? 0 : 1}">
    <button type="submit">${q.done ? '안 읽음으로' : '처리함으로'}</button>
  </form>
</div>`,
        )
        .join('')
    : '<div class="none">아직 들어온 문의가 없어요.</div>'
}

<h2>방문자</h2>
<table>
<tr><th>번호</th><th>방문</th><th>업로드</th><th>스냅샷</th><th>처음</th><th>마지막</th></tr>
${rows.results
  .map(
    (r) =>
      `<tr><td><code title="${escapeHtml(String(r.code))}">${no(r.seq)}</code></td><td>${r.visits}</td><td>${r.uploads}</td><td>${r.snapshots}</td><td>${fmt(r.first_at)}</td><td>${fmt(r.last_at)}</td></tr>`,
  )
  .join('')}
</table>
<p class="hint">
  번호는 들어온 순서예요. 누구인지 알 수 있는 정보는 저장하지 않아요.
  (번호에 마우스를 올리면 실제 코드가 보여요.)<br>
  방문은 하루에 한 번만 세요. <b>두 번 이상 올린 사람</b>이 구독이 성립하는지 보여주는 숫자예요.
</p>
</div></body></html>`
  return new Response(body, { headers: { 'content-type': 'text/html;charset=utf-8' } })
}

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = env.ALLOWED_ORIGIN

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) })
    }

    if (url.pathname === '/v' && request.method === 'POST') {
      // 우리 사이트에서 온 요청만 받습니다.
      const from = request.headers.get('origin')
      if (from && from !== origin) return new Response('forbidden', { status: 403 })
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('bad json', { status: 400 })
      }
      const res = await recordVisit(env, body)
      return new Response(res.body, { status: res.status, headers: cors(origin) })
    }

    if (url.pathname === '/q' && request.method === 'POST') {
      const from = request.headers.get('origin')
      if (from && from !== origin) return new Response('forbidden', { status: 403 })
      let body
      try {
        body = await request.json()
      } catch {
        return new Response('bad json', { status: 400 })
      }
      const res = await recordInquiry(env, body)
      return new Response(res.body, { status: res.status, headers: cors(origin) })
    }

    // 문의를 처리함/안 읽음으로 바꿉니다. 관리자 화면에서만 부릅니다.
    if (url.pathname === '/admin/done' && request.method === 'POST') {
      if (url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('열쇠가 필요해요', { status: 401 })
      }
      const form = await request.formData()
      const id = Number(form.get('id'))
      const to = form.get('to') === '1' ? 1 : 0
      if (Number.isInteger(id)) {
        await env.DB.prepare(`UPDATE inquiry SET done = ?2 WHERE id = ?1`).bind(id, to).run()
      }
      return new Response(null, {
        status: 303,
        headers: { location: `/admin?key=${encodeURIComponent(env.ADMIN_KEY)}` },
      })
    }

    if (url.pathname === '/admin') {
      // 열쇠는 Workers 비밀값에만 있습니다. 공개 저장소에 들어가지 않습니다.
      if (url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('열쇠가 필요해요: /admin?key=...', { status: 401 })
      }
      return adminPage(env)
    }

    return new Response('not found', { status: 404 })
  },
}
