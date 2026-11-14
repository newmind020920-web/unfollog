/**
 * 문의 보내기.
 *
 * 보내는 것: 본인이 적은 글, 답장받을 곳(비워도 됨), 그리고 본인이 켰을 때만
 * 숫자 요약(팔로워·팔로잉 수, 읽은 파일 이름, 브라우저 종류).
 * 보내지 않는 것: 팔로워 목록, 아이디, 그 밖에 누구인지 알 수 있는 모든 것.
 */

import type { Snapshot } from '../types'
import { visitorCode } from './visit'

const API = import.meta.env.VITE_API_URL as string | undefined

/** 문의 창구를 열어 둘 수 있는지 — 집계 주소가 없으면 받을 곳도 없습니다. */
export const CAN_CONTACT = !!API

export type SendResult =
  | { ok: true }
  | { ok: false; kind: 'too-soon' | 'old-server' | 'rejected' | 'server-error' | 'offline'; detail: string }

/**
 * 함께 보낼 숫자 요약을 만듭니다.
 *
 * 숫자가 이상하다는 문의가 가장 많은데, 이 한 줄이 없으면 답이 "파일을
 * 보내주세요" 밖에 안 됩니다. 그래서 화면에 그대로 보여주고, 본인이 보고
 * 끌 수 있게 합니다.
 */
export function buildMeta(current: Snapshot | null, snapshotCount: number): string {
  const parts: string[] = []
  if (current) {
    parts.push(`팔로워 ${current.followers.length} / 팔로잉 ${current.following.length}`)
    if (current.sources?.length) {
      parts.push(current.sources.map((s) => `${s.file} ${s.count}명`).join(', '))
    }
    if (current.coverage) {
      const d = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 7)
      parts.push(`기간 ${d(current.coverage.first)}~${d(current.coverage.last)}`)
    }
  }
  parts.push(`스냅샷 ${snapshotCount}개`)
  parts.push(browserHint())
  return parts.join(' · ')
}

/**
 * 브라우저 종류만 짧게. 압축 해제나 저장이 막히는 문제는 브라우저를 알아야
 * 재현할 수 있습니다. 전체 User-Agent 는 지문이 될 수 있어 보내지 않습니다.
 */
function browserHint(): string {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac/.test(ua)
        ? 'Mac'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : '기타'
  const app = /CriOS|Chrome\//.test(ua)
    ? 'Chrome'
    : /FxiOS|Firefox/.test(ua)
      ? 'Firefox'
      : /Edg\//.test(ua)
        ? 'Edge'
        : /Safari/.test(ua)
          ? 'Safari'
          : '기타'
  return `${os} ${app}`
}

export async function sendInquiry(input: {
  message: string
  contact?: string
  meta?: string
}): Promise<SendResult> {
  if (!API) return { ok: false, kind: 'rejected', detail: '보낼 주소가 설정돼 있지 않아요' }
  const message = input.message.trim()
  if (!message) return { ok: false, kind: 'rejected', detail: '내용이 비어 있어요' }

  const payload = JSON.stringify({
    code: visitorCode(),
    message,
    ...(input.contact?.trim() ? { contact: input.contact.trim() } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  })

  try {
    // 방문 집계와 같은 이유로 text/plain 입니다. application/json 이면
    // 브라우저가 CORS 사전 요청을 요구합니다.
    const res = await fetch(`${API}/q`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: payload,
    })
    if (res.ok) return { ok: true }
    if (res.status === 429) {
      return { ok: false, kind: 'too-soon', detail: '429' }
    }
    // 404 는 서버에 문의 창구가 아직 없다는 뜻입니다. 워커를 새로 올리지
    // 않으면 방문 집계(/v)만 되고 문의(/q)는 없는 상태가 됩니다.
    if (res.status === 404) {
      return { ok: false, kind: 'old-server', detail: '404' }
    }
    if (res.status === 403) {
      return { ok: false, kind: 'rejected', detail: '403' }
    }
    return { ok: false, kind: 'server-error', detail: String(res.status) }
  } catch (err) {
    // fetch 자체가 실패한 경우 — 인터넷이 끊겼거나, 서버가 CORS 헤더 없이
    // 거절해서 브라우저가 응답을 막은 경우입니다.
    return { ok: false, kind: 'offline', detail: err instanceof Error ? err.message : '연결 실패' }
  }
}

/** 실패했을 때 사람에게 보여 줄 말. 무엇을 해야 하는지까지 적습니다. */
export function failureText(r: Extract<SendResult, { ok: false }>): string {
  switch (r.kind) {
    case 'too-soon':
      return '방금 보내셨어요. 1분 뒤에 다시 눌러주세요.'
    case 'old-server':
      return '문의 창구가 아직 서버에 올라가지 않았어요. 잠시 뒤에 다시 시도해 주세요.'
    case 'rejected':
      return '서버가 요청을 받지 않았어요. 잠시 뒤에 다시 시도해 주세요.'
    case 'server-error':
      return '서버에서 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.'
    case 'offline':
      return '연결하지 못했어요. 인터넷 상태를 확인하고 다시 시도해 주세요.'
  }
}
