import type { IgUser } from '../types'

function escapeCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙입니다. */
export function toCsv(users: IgUser[]): string {
  const rows = [
    ['username', 'profile_url', 'followed_at'],
    ...users.map((u) => [
      u.display,
      u.href,
      u.followedAt ? new Date(u.followedAt * 1000).toISOString() : '',
    ]),
  ]
  return '﻿' + rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
}

export function download(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
