/**
 * 방문 집계.
 *
 * 보내는 것: 이 브라우저가 스스로 만든 난수 코드, 방문/업로드 여부, 스냅샷 개수.
 * 보내지 않는 것: 팔로워 목록, 아이디, 그 밖에 누구인지 알 수 있는 모든 것.
 *
 * 집계 주소가 설정돼 있지 않으면 아무것도 하지 않습니다. 실패해도 조용히
 * 넘어갑니다 — 집계가 안 되는 것이 분석을 막을 이유는 없습니다.
 */

const API = import.meta.env.VITE_API_URL as string | undefined
const CODE_KEY = 'unfollog.code'

/** 이 브라우저의 코드. 없으면 만들어 둡니다. */
export function visitorCode(): string | null {
  try {
    const saved = localStorage.getItem(CODE_KEY)
    if (saved && /^[0-9a-f]{16}$/.test(saved)) return saved

    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(CODE_KEY, code)
    return code
  } catch {
    // 저장이 막힌 브라우저에서는 집계를 포기합니다.
    return null
  }
}

export function ping(detail: { uploaded?: boolean; snapshots?: number } = {}) {
  if (!API) return
  const code = visitorCode()
  if (!code) return

  const payload = JSON.stringify({ code, ...detail })

  // 보내는 형식을 text/plain 으로 둡니다. application/json 으로 보내면
  // 브라우저가 CORS 사전 요청(preflight)을 요구하는데, sendBeacon 은 그것을
  // 하지 못해 조용히 실패합니다. 서버는 형식과 상관없이 본문을 JSON 으로 읽습니다.
  const TYPE = 'text/plain;charset=UTF-8'
  try {
    // sendBeacon 은 페이지를 떠나는 중에도 전송을 보장합니다.
    if (navigator.sendBeacon?.(`${API}/v`, new Blob([payload], { type: TYPE }))) {
      return
    }
  } catch {
    /* 아래 fetch 로 */
  }
  void fetch(`${API}/v`, {
    method: 'POST',
    headers: { 'content-type': TYPE },
    body: payload,
    keepalive: true,
  }).catch(() => {})
}
