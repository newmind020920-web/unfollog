import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { IgUser } from '../types'
import { download, toCsv } from '../lib/export'
import { Avatar, Button, Icon, cx } from './ui'

const PAGE = 100

/** 링크로 열리는 페이지(아티팩트)에서는 파일 저장이 막혀 있어 CSV 버튼을 빼고 복사만 둡니다. */
const CAN_DOWNLOAD = !import.meta.env.VITE_ARTIFACT

type SortKey = 'leftRecent' | 'leftOld' | 'recent' | 'oldest' | 'name'

const SORT_LABELS: Record<SortKey, string> = {
  leftRecent: '최근에 떠난 순',
  leftOld: '오래전에 떠난 순',
  recent: '최근 팔로우순',
  oldest: '오래된 팔로우순',
  name: '아이디순',
}

/** 사용자명 → 언제 떠났는지. 주어지면 행에 시점이 붙고 정렬 기준이 늘어납니다. */
export type Timeline = Map<string, { lastSeenAt: number; goneByAt: number; label: string }>

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 클립보드 API 가 막힌 환경: 임시 textarea 를 선택해서 복사합니다.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function UserList({
  users,
  csvName,
  empty,
  timeline,
  notes,
  tags,
  gone,
}: {
  users: IgUser[]
  csvName: string
  empty: ReactNode
  timeline?: Timeline
  /** 사용자명 → 행 아래 설명. 떠난 시점 대신 보여줍니다 */
  notes?: Map<string, string>
  /** 사용자명 → 이름 옆 꼬리표 */
  tags?: Map<string, string>
  /**
   * 사라진 계정 표시 기능을 켭니다. 프로필을 열어 확인한 결과를
   * 사용자가 직접 남기고, 표시한 계정은 목록에서 흐리게 보입니다.
   */
  gone?: { set: Set<string>; onToggle: (username: string, gone: boolean) => void }
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>(timeline ? 'leftRecent' : 'recent')
  const [limit, setLimit] = useState(PAGE)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    const base = q ? users.filter((u) => u.username.includes(q)) : users
    const sorted = [...base]
    if (sort === 'leftRecent' || sort === 'leftOld') {
      const dir = sort === 'leftRecent' ? -1 : 1
      sorted.sort((a, b) => {
        const av = timeline?.get(a.username)?.goneByAt
        const bv = timeline?.get(b.username)?.goneByAt
        if (av === undefined || bv === undefined) return a.username.localeCompare(b.username)
        return (av - bv) * dir || a.username.localeCompare(b.username)
      })
    } else if (sort === 'name') {
      sorted.sort((a, b) => a.username.localeCompare(b.username))
    } else {
      const dir = sort === 'recent' ? -1 : 1
      // 날짜가 없는 항목은 항상 뒤로 보냅니다.
      sorted.sort((a, b) => {
        const av = a.followedAt
        const bv = b.followedAt
        if (av === undefined && bv === undefined) return a.username.localeCompare(b.username)
        if (av === undefined) return 1
        if (bv === undefined) return -1
        return (av - bv) * dir
      })
    }
    return sorted
  }, [users, query, sort, timeline])

  if (!users.length) {
    return <div className="px-6 py-16 text-center">{empty}</div>
  }

  const visible = filtered.slice(0, limit)
  const hasAnyDate = timeline !== undefined || users.some((u) => u.followedAt !== undefined)
  const goneShown = gone ? filtered.filter((u) => gone.set.has(u.username)).length : 0

  async function handleCopy() {
    const ok = await copyText(filtered.map((u) => u.display).join('\n'))
    setCopied(ok ? 'ok' : 'fail')
    clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied('idle'), 2200)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 sm:px-5">
        <div className="relative order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          <Icon
            name="search"
            size={18}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint"
          />
          <input
            id="user-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="아이디 검색"
            aria-label="아이디 검색"
            className="h-11 w-full rounded-xl bg-sunken pr-3 pl-11 text-[15px] text-fg placeholder:text-faint"
          />
        </div>

        {hasAnyDate && (
          <select
            id="user-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 min-w-0 flex-1 rounded-xl bg-sunken px-3.5 text-[14px] font-medium text-fg-2 sm:flex-none"
            aria-label="정렬 기준"
          >
            {(Object.keys(SORT_LABELS) as SortKey[])
              .filter((k) => (k === 'leftRecent' || k === 'leftOld' ? timeline !== undefined : true))
              .map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
          </select>
        )}

        <Button size="md" onClick={handleCopy} title="지금 보이는 아이디를 모두 복사">
          <Icon name={copied === 'ok' ? 'check' : 'copy'} size={17} />
          {copied === 'ok' ? (
            '복사했어요'
          ) : copied === 'fail' ? (
            '복사 실패'
          ) : (
            <span>
              <span className="hidden sm:inline">아이디 </span>복사
            </span>
          )}
        </Button>

        {CAN_DOWNLOAD && (
          <Button
            size="md"
            onClick={() => download(`${csvName}.csv`, toCsv(filtered, timeline))}
            title="지금 보이는 목록을 CSV 파일로 저장"
          >
            <Icon name="download" size={17} />
            CSV
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="ko px-6 py-14 text-center text-[15px] text-muted">
          ‘{query}’와 일치하는 아이디가 없어요.
        </p>
      ) : (
        <>
          <ul>
            {visible.map((user) => (
              <li
                key={user.username}
                className="relative after:absolute after:right-0 after:bottom-0 after:left-[70px] after:h-px after:bg-line last:after:hidden"
              >
                <Row
                  user={user}
                  note={notes?.get(user.username) ?? timeline?.get(user.username)?.label}
                  tag={tags?.get(user.username)}
                  gone={gone}
                />
              </li>
            ))}
          </ul>

          <div
            className={cx(
              'flex items-center justify-between gap-3 px-5 py-4',
              filtered.length > limit && 'border-t border-line',
            )}
          >
            <span className="ko tnum text-[13px] text-faint">
              {Math.min(limit, filtered.length).toLocaleString('ko-KR')} /{' '}
              {filtered.length.toLocaleString('ko-KR')}명
              {/* 표시해 둔 계정은 목록에는 남지만 위의 수에는 안 들어갑니다 */}
              {goneShown > 0 && ` · 사라진 계정 ${goneShown.toLocaleString('ko-KR')}명 포함`}
            </span>
            {filtered.length > limit && (
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE * 4)}>
                더 보기
                <Icon name="chevron" size={15} className="rotate-90" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({
  user,
  note,
  tag,
  gone,
}: {
  user: IgUser
  note?: string
  tag?: string
  gone?: { set: Set<string>; onToggle: (username: string, gone: boolean) => void }
}) {
  const isGone = gone?.set.has(user.username) ?? false
  const body = (
    <>
      <Avatar />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cx(
              'truncate text-[16px] leading-[1.4] font-semibold',
              isGone && 'text-faint line-through',
            )}
          >
            @{user.display}
          </span>
          {isGone ? (
            <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              사라진 계정
            </span>
          ) : (
            tag && (
              <span className="shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                {tag}
              </span>
            )
          )}
        </span>
        {note ? (
          <span className="tnum mt-0.5 block truncate text-[13px] text-faint">{note}</span>
        ) : (
          user.followedAt && (
            <span className="tnum mt-0.5 block text-[13px] text-faint">
              {new Date(user.followedAt * 1000).toLocaleDateString('ko-KR')} 팔로우
            </span>
          )
        )}
      </span>
    </>
  )

  if (!user.href) {
    return <div className="flex items-center gap-3.5 px-4 py-3 sm:px-5">{body}</div>
  }

  const link = (
    <a
      href={user.href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex min-w-0 flex-1 items-center gap-3.5 transition-opacity hover:opacity-70"
    >
      {body}
      {/* 터치 기기에는 hover 가 없으므로 항상 보이게 둡니다. */}
      <Icon name="external" size={17} className="shrink-0 text-line-strong" />
    </a>
  )

  if (!gone) {
    return <div className="flex items-center gap-3.5 px-4 py-3 sm:px-5">{link}</div>
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3.5">{link}</div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => gone.onToggle(user.username, !isGone)}
          data-gone-toggle={user.username}
          className={cx(
            'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
            isGone ? 'bg-brand-weak text-brand' : 'bg-sunken text-muted hover:text-fg',
          )}
        >
          {isGone ? '사라진 계정으로 표시함 · 취소' : '프로필이 안 열려요'}
        </button>
      </div>
    </div>
  )
}
