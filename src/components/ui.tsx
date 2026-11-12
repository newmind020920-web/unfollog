import type { ReactNode } from 'react'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-[20px] bg-card shadow-card', className)}>{children}</div>
}

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  title,
  full,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'card'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  title?: string
  full?: boolean
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const sizes = {
    sm: 'h-9 rounded-[10px] px-3.5 text-[14px]',
    md: 'h-11 rounded-xl px-4 text-[15px]',
    lg: 'h-[54px] rounded-[14px] px-6 text-[17px]',
  }
  const variants = {
    primary: 'bg-blue text-white hover:bg-blue-hover',
    default: 'bg-sunken text-fg-2 hover:bg-line',
    ghost: 'text-muted hover:bg-sunken hover:text-fg',
    danger: 'bg-red-weak text-red hover:brightness-95',
    /* 옅은 배경 위에 올리는 버튼 */
    card: 'bg-card text-fg-2 hover:text-fg',
  }
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(base, sizes[size], variants[variant], full && 'w-full')}
    >
      {children}
    </button>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'blue' | 'red' | 'green'
}) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    blue: 'bg-blue-weak text-blue',
    red: 'bg-red-weak text-red',
    green: 'bg-green-weak text-green',
  }
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

/** 안내문 상자 — 토스가 본문 중간에 쓰는 옅은 배경 블록 */
export function InfoBox({
  icon = 'info',
  tone = 'neutral',
  children,
}: {
  icon?: IconName
  tone?: 'neutral' | 'blue'
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    blue: 'bg-blue-weak text-blue',
  }
  return (
    <div className={cx('flex gap-2.5 rounded-2xl p-4 text-[14px] leading-[1.6]', tones[tone])}>
      <Icon name={icon} size={17} className="mt-px shrink-0" />
      <p className="ko flex-1">{children}</p>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export type IconName =
  | 'upload' | 'lock' | 'search' | 'download' | 'trash' | 'external'
  | 'check' | 'info' | 'clock' | 'chevron' | 'logo' | 'x' | 'pencil' | 'copy'
  | 'user' | 'users' | 'userMinus' | 'userPlus' | 'userCheck' | 'userX' | 'swap' | 'layers' | 'ban'

/** 사람 아이콘의 공통 몸통 — 오른쪽에 기호를 붙여 변형합니다 */
const PERSON = (
  <>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 19.5c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
  </>
)

const PATHS: Record<IconName, ReactNode> = {
  logo: <path d="M6 18L18 6M18 6v8M18 6h-8" />,
  upload: (
    <>
      <path d="M12 16.5V4.5m0 0L7.5 9M12 4.5L16.5 9" />
      <path d="M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="3" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  search: (<><circle cx="11" cy="11" r="6.25" /><path d="M19.5 19.5l-4-4" /></>),
  download: (<><path d="M12 4.5v10m0 0l-4-4m4 4l4-4" /><path d="M5 19.5h14" /></>),
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </>
  ),
  external: (<><path d="M14 5h5v5" /><path d="M19 5l-7.5 7.5" /><path d="M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5" /></>),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.9" r="0.9" fill="currentColor" stroke="none" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" />  </>),
  chevron: <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  pencil: (<><path d="M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3z" /></>),
  copy: (<><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V7a2.5 2.5 0 0 0-2.5-2.5H7A2.5 2.5 0 0 0 4.5 7v6A2.5 2.5 0 0 0 7 15.5h1.5" /></>),
  user: (<>{PERSON}</>),
  users: (<>{PERSON}<path d="M15.5 4.9a3.5 3.5 0 0 1 0 6.2" /><path d="M18 14.6c1.6.9 2.6 2.6 3 4.9" /></>),
  userMinus: (<>{PERSON}<path d="M17 10.5h5" /></>),
  userPlus: (<>{PERSON}<path d="M19.5 8v5M17 10.5h5" /></>),
  userCheck: (<>{PERSON}<path d="M16.8 10.7l1.8 1.8 3.3-3.7" /></>),
  userX: (<>{PERSON}<path d="M17.4 8.4l4.2 4.2M21.6 8.4l-4.2 4.2" /></>),
  swap: (<><path d="M6 8.5h12m0 0l-3-3m3 3l-3 3" /><path d="M18 15.5H6m0 0l3-3m-3 3l3 3" /></>),
  ban: (<><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>),
  layers: (<><path d="M12 4.5l8 4-8 4-8-4 8-4z" /><path d="M4 12.5l8 4 8-4" /><path d="M4 16l8 4 8-4" /></>),
}

export function Icon({
  name,
  size = 18,
  className,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('shrink-0', className)}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}

const DAY = ['일', '월', '화', '수', '목', '금', '토']

export function formatDate(ms: number) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY[d.getDay()]}) ${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function formatDay(ms: number) {
  const d = new Date(ms)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/**
 * 두 시점을 "11월 5일 → 11월 12일" 로 씁니다.
 * 같은 날이면 날짜만으로는 구분이 안 되므로 시각까지 붙입니다.
 */
export function formatRange(from: number, to: number) {
  const a = new Date(from)
  const b = new Date(to)
  const sameDay = a.toDateString() === b.toDateString()
  if (!sameDay) return `${formatDay(from)} → ${formatDay(to)}`
  const hm = (d: Date) =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  return `${formatDay(from)} ${hm(a)} → ${hm(b)}`
}

/** "3일 전", "2주 전" 처럼 지금으로부터 얼마나 지났는지 */
export function formatAgo(ms: number, now = Date.now()) {
  const elapsed = Math.max(0, now - ms)
  const day = 86_400_000
  if (elapsed < day) return '오늘'
  const days = Math.floor(elapsed / day)
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 28) return `${Math.floor(days / 7)}주 전`
  if (days < 365) return `${Math.max(1, Math.round(days / 30))}개월 전`
  return `${Math.floor(days / 365)}년 전`
}

/** 두 시점을 "11월 5~12일" 처럼 짧게. 같은 날이면 날짜 하나만 돌려줍니다. */
export function formatSpan(from: number, to: number): { text: string; sameDay: boolean } {
  const a = new Date(from)
  const b = new Date(to)
  if (a.toDateString() === b.toDateString()) return { text: formatDay(to), sameDay: true }
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return { text: `${a.getMonth() + 1}월 ${a.getDate()}~${b.getDate()}일`, sameDay: false }
  }
  return { text: `${formatDay(from)}~${formatDay(to)}`, sameDay: false }
}
