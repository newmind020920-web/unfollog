/**
 * 캘린더 알림 파일(.ics) 을 만듭니다.
 *
 * 서버 없이 알림을 거는 유일한 방법입니다. 사용자가 받아서 열면
 * 휴대폰 기본 캘린더에 일정이 들어가고, 그날 알림이 옵니다.
 * 전화번호를 받지 않으므로 "아무것도 전송하지 않는다"가 그대로 유지됩니다.
 */

/** iCalendar 는 쉼표·세미콜론·역슬래시·줄바꿈을 escape 해야 합니다. */
function escapeText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

const pad = (n: number) => String(n).padStart(2, '0')
const asDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

/** 긴 줄은 75바이트마다 접어야 하는 규격이라, 안전하게 접어 줍니다. */
function fold(line: string) {
  if (line.length <= 73) return line
  const parts: string[] = []
  let rest = line
  while (rest.length > 73) {
    parts.push(rest.slice(0, 73))
    rest = rest.slice(73)
  }
  parts.push(rest)
  return parts.join('\r\n ')
}

export function buildReminderIcs(when: Date, siteUrl: string, now = new Date()): string {
  // 하루 종일 일정으로 만듭니다. 시간대 때문에 날짜가 밀리는 일이 없습니다.
  const next = new Date(when)
  next.setDate(next.getDate() + 1)

  const stamp =
    `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `T000000Z`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//unfollog//reminder//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${stamp}-${Math.random().toString(36).slice(2, 10)}@unfollog`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${asDate(when)}`,
    `DTEND;VALUE=DATE:${asDate(next)}`,
    `SUMMARY:${escapeText('언팔로그 — 인스타 팔로워 다시 확인하기')}`,
    `DESCRIPTION:${escapeText(
      '인스타그램에서 내 정보를 다시 내보내서 올리면, 그동안 누가 언팔했는지 알 수 있어요.\n' +
        siteUrl,
    )}`,
    `URL:${escapeText(siteUrl)}`,
    'BEGIN:VALARM',
    // 하루 종일 일정이라 자정 기준입니다. 9시간 뒤 = 그날 오전 9시.
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText('인스타 팔로워 다시 확인할 때예요')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n')
}

/** 오늘로부터 며칠 뒤 */
export function daysFromNow(days: number, from = new Date()): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}
