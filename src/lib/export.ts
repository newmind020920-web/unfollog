import type { IgUser } from '../types'

function escapeCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * 엑셀에서 한글이 깨지지 않도록 BOM 을 붙입니다.
 *
 * @param windows 사용자명 → 떠난 구간. 주어지면 left_after / left_before 열이 붙습니다.
 */
export function toCsv(
  users: IgUser[],
  windows?: Map<string, { lastSeenAt: number; goneByAt: number }>,
): string {
  const withWindow = windows !== undefined && windows.size > 0
  const header = ['username', 'profile_url', 'followed_at']
  if (withWindow) header.push('left_after', 'left_before')

  const rows = [
    header,
    ...users.map((u) => {
      const row = [
        u.display,
        u.href,
        u.followedAt ? new Date(u.followedAt * 1000).toISOString() : '',
      ]
      if (withWindow) {
        const w = windows.get(u.username)
        row.push(w ? isoDay(w.lastSeenAt) : '', w ? isoDay(w.goneByAt) : '')
      }
      return row
    }),
  ]
  return '\uFEFF' + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  // 문서에 붙이지 않으면 브라우저가 download 속성을 무시해 파일 이름이 사라집니다.
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 곧바로 거두면 저장이 시작되기 전에 주소가 사라질 수 있습니다.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
