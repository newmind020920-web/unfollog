import { useMemo, useState, type ReactNode } from 'react'
import type { IgUser } from '../types'
import { download, toCsv } from '../lib/export'
import { Button, Icon, cx } from './ui'

const PAGE = 100

type SortKey = 'recent' | 'oldest' | 'name'

const SORT_LABELS: Record<SortKey, string> = {
  recent: '최근 팔로우순',
  oldest: '오래된 팔로우순',
  name: '아이디순',
}

export function UserList({
  users,
  csvName,
  empty,
  /** followedAt 이 의미 없는 목록에서는 날짜 정렬을 숨깁니다 */
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
    return <div className="px-6 py-16 text-center">{empty}</div>
  }

  const visible = filtered.slice(0, limit)
  const hasAnyDate = showFollowedAt && users.some((u) => u.followedAt !== undefined)

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
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="아이디 검색"
            className="h-11 w-full rounded-xl bg-sunken pr-3 pl-11 text-[15px] text-fg placeholder:text-faint"
          />
        </div>

        {hasAnyDate && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-11 rounded-xl bg-sunken px-3.5 text-[14px] font-medium text-fg-2"
            aria-label="정렬 기준"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        )}

        <Button size="md" onClick={() => download(`${csvName}.csv`, toCsv(filtered))} title="지금 보이는 목록을 CSV 로 저장">
          <Icon name="download" size={17} />
          CSV
        </Button>
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
                <a
                  href={user.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-sunken sm:px-5"
                >
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sunken text-[16px] font-bold text-faint uppercase"
                  >
                    {user.display.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] leading-[1.4] font-semibold">
                      @{user.display}
                    </span>
                    {showFollowedAt && user.followedAt && (
                      <span className="tnum mt-0.5 block text-[13px] text-faint">
                        {new Date(user.followedAt * 1000).toLocaleDateString('ko-KR')} 팔로우
                      </span>
                    )}
                  </span>
                  {/* 터치 기기에는 hover 가 없으므로 항상 보이게 둡니다. */}
                  <Icon name="external" size={17} className="text-line-strong" />
                </a>
              </li>
            ))}
          </ul>

          <div
            className={cx(
              'flex items-center justify-between gap-3 px-5 py-4',
              filtered.length > limit && 'border-t border-line',
            )}
          >
            <span className="tnum text-[13px] text-faint">
              {Math.min(limit, filtered.length).toLocaleString('ko-KR')} /{' '}
              {filtered.length.toLocaleString('ko-KR')}명
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
