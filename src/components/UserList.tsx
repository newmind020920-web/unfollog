import { useMemo, useState, type ReactNode } from 'react'
import type { IgUser } from '../types'
import { download, toCsv } from '../lib/export'
import { Button, Icon, cx } from './ui'

const PAGE = 150

type SortKey = 'recent' | 'oldest' | 'name'

const SORT_LABELS: Record<SortKey, string> = {
  recent: '최근 팔로우순',
  oldest: '오래된 팔로우순',
  name: '이름순',
}

export function UserList({
  users,
  csvName,
  empty,
  /** followedAt 이 의미가 없는 목록(내 팔로잉 기준 등)에서는 날짜 정렬을 숨깁니다 */
  showFollowedAt = true,
}: {
  users: IgUser[]
  csvName: string
  empty: ReactNode
  showFollowedAt?: boolean
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>(showFollowedAt ? 'recent' : 'name')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? users.filter((u) => u.username.includes(q)) : users
    const sorted = [...base]
    if (sort === 'name') {
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
  }, [users, query, sort])

  if (!users.length) {
    return <div className="px-5 py-14 text-center">{empty}</div>
  }

  const visible = filtered.slice(0, limit)
  const hasAnyDate = showFollowedAt && users.some((u) => u.followedAt !== undefined)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative order-first w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="아이디 검색"
            className="w-full rounded-xl border border-line bg-surface-2 py-2 pr-3 pl-9 text-sm text-fg placeholder:text-faint"
          />
        </div>

        {hasAnyDate && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-muted"
            aria-label="정렬 기준"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        )}

        <Button
          size="sm"
          onClick={() => download(`${csvName}.csv`, toCsv(filtered))}
          title="현재 목록을 CSV 로 저장"
        >
          <Icon name="download" size={15} />
          CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">
          “{query}” 와 일치하는 아이디가 없습니다.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line/70">
            {visible.map((user, i) => (
              <li key={user.username}>
                <a
                  href={user.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="tnum w-8 shrink-0 text-right text-[12px] text-faint">
                    {i + 1}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[13px] font-semibold text-muted uppercase"
                  >
                    {user.display.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      @{user.display}
                    </span>
                    {showFollowedAt && user.followedAt && (
                      <span className="block text-[12px] text-faint">
                        {new Date(user.followedAt * 1000).toLocaleDateString('ko-KR')} 팔로우
                      </span>
                    )}
                  </span>
                  <Icon
                    name="external"
                    size={15}
                    className="text-faint opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </a>
              </li>
            ))}
          </ul>

          <div
            className={cx(
              'flex items-center justify-between gap-3 px-4 py-3 text-[12px] text-faint',
              filtered.length > limit && 'border-t border-line',
            )}
          >
            <span className="tnum">
              {Math.min(limit, filtered.length).toLocaleString('ko-KR')} /{' '}
              {filtered.length.toLocaleString('ko-KR')}명
            </span>
            {filtered.length > limit && (
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE * 4)}>
                더 보기
                <Icon name="chevron" size={14} className="rotate-90" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
