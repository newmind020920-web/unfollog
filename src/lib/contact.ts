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

export type SendResult = 'sent' | 'too-soon' | 'failed'

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
  if (!API) return 'failed'
  const message = input.message.trim()
  if (!message) return 'failed'

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
    if (res.status === 429) return 'too-soon'
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
