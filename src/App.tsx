import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IgUser, Snapshot, SnapshotMeta } from './types'
import { analyze, compare, mayContainRenames } from './lib/analyze'
import {
  clearAll,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  putSnapshot,
  renameSnapshot,
} from './lib/db'
import { parseFiles } from './lib/parse'
import { Dropzone } from './components/Dropzone'
import { Guide } from './components/Guide'
import { SnapshotPanel } from './components/SnapshotPanel'
import { UserList } from './components/UserList'
import { Card, Icon, Pill, Spinner, cx, formatDateShort } from './components/ui'

type TabKey = 'unfollowers' | 'crush' | 'fans' | 'newFollowers' | 'mutual' | 'snapshots'

type Notice = { tone: 'danger' | 'success' | 'info'; text: string } | null

function newSnapshotLabel(createdAt: number, existing: SnapshotMeta[]) {
  const base = new Date(createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const sameDay = existing.filter((m) => m.label.startsWith(base)).length
  return sameDay ? `${base} (${sameDay + 1})` : base
}

export default function App() {
  const [metas, setMetas] = useState<SnapshotMeta[]>([])
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [baseline, setBaseline] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [tab, setTab] = useState<TabKey>('unfollowers')

  /** 지정한 스냅샷을 최신으로 삼고, 그보다 오래된 것 중 가장 최근을 기준으로 잡습니다. */
  const selectPair = useCallback(
    async (list: SnapshotMeta[], currentId: string | null, baselineId?: string | null) => {
      if (!currentId) {
        setCurrent(null)
        setBaseline(null)
        return
      }
      const curr = await getSnapshot(currentId)
      setCurrent(curr ?? null)
      if (!curr) {
        setBaseline(null)
        return
      }
      const resolvedBaselineId =
        baselineId !== undefined
          ? baselineId
          : (list.find((m) => m.createdAt < curr.createdAt && m.id !== curr.id)?.id ?? null)
      setBaseline(resolvedBaselineId ? ((await getSnapshot(resolvedBaselineId)) ?? null) : null)
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await listSnapshots()
        if (cancelled) return
        setMetas(list)
        await selectPair(list, list[0]?.id ?? null)
      } catch (err) {
        if (!cancelled) {
          setNotice({
            tone: 'danger',
            text: `저장된 스냅샷을 읽을 수 없습니다: ${
              err instanceof Error ? err.message : '알 수 없는 오류'
            }`,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectPair])

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true)
      setNotice(null)
      setWarnings([])
      try {
        const result = await parseFiles(files)
        setWarnings(result.warnings)

        if (!result.followers.length && !result.following.length) {
          setNotice({
            tone: 'danger',
            text:
              '파일에서 팔로워/팔로잉 목록을 찾지 못했습니다. 내보내기에 "팔로워 및 팔로잉" 이 포함됐는지 확인해 주세요.',
          })
          return
        }

        const createdAt = Date.now()
        const existing = await listSnapshots()
        const snapshot: Snapshot = {
          id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt,
          label: newSnapshotLabel(createdAt, existing),
          followers: result.followers,
          following: result.following,
        }
        await putSnapshot(snapshot)

        const list = await listSnapshots()
        setMetas(list)
        await selectPair(list, snapshot.id)

        const prevNewest = existing[0]
        setNotice({
          tone: 'success',
          text: prevNewest
            ? `스냅샷을 저장했습니다. "${prevNewest.label}" 과 비교해 언팔로워를 계산했습니다.`
            : `첫 스냅샷을 저장했습니다. 팔로워 ${result.followers.length.toLocaleString(
                'ko-KR',
              )}명, 팔로잉 ${result.following.length.toLocaleString('ko-KR')}명.`,
        })
        setTab(prevNewest ? 'unfollowers' : 'crush')
      } catch (err) {
        setNotice({
          tone: 'danger',
          text: err instanceof Error ? err.message : '파일을 읽는 중 오류가 발생했습니다.',
        })
      } finally {
        setBusy(false)
      }
    },
    [selectPair],
  )

  const analysis = useMemo(() => (current ? analyze(current) : null), [current])
  const comparison = useMemo(
    () => (current && baseline ? compare(baseline, current) : null),
    [current, baseline],
  )

  const tabs = useMemo(() => {
    return [
      {
        key: 'unfollowers' as const,
        label: '언팔로워',
        count: comparison?.unfollowers.length,
        tone: 'danger' as const,
      },
      { key: 'crush' as const, label: '짝사랑', count: analysis?.notFollowingBack.length },
      { key: 'fans' as const, label: '팬', count: analysis?.fans.length },
      {
        key: 'newFollowers' as const,
        label: '새 팔로워',
        count: comparison?.newFollowers.length,
        tone: 'success' as const,
      },
      { key: 'mutual' as const, label: '맞팔', count: analysis?.mutual.length },
      { key: 'snapshots' as const, label: '스냅샷', count: metas.length },
    ]
  }, [analysis, comparison, metas.length])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  const hasData = current !== null

  return (
    <div className="aurora min-h-screen">
      <div className="relative z-10">
        <Header
          hasData={hasData}
          busy={busy}
          onFiles={handleFiles}
        />

        <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
          {notice && <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />}
          {warnings.length > 0 && <WarningBox warnings={warnings} />}

          {!hasData ? (
            <Landing busy={busy} onFiles={handleFiles} />
          ) : (
            <Dashboard
              current={current}
              baseline={baseline}
              analysis={analysis!}
              comparison={comparison}
              metas={metas}
              tab={tab}
              tabs={tabs}
              onTab={setTab}
              onPickCurrent={async (id) => {
                await selectPair(metas, id)
              }}
              onPickBaseline={async (id) => {
                await selectPair(metas, current.id, id)
              }}
              onDelete={async (id) => {
                await deleteSnapshot(id)
                const list = await listSnapshots()
                setMetas(list)
                const nextCurrent = current.id === id ? (list[0]?.id ?? null) : current.id
                await selectPair(list, nextCurrent)
              }}
              onRename={async (id, label) => {
                await renameSnapshot(id, label)
                const list = await listSnapshots()
                setMetas(list)
                if (current.id === id) setCurrent({ ...current, label })
                if (baseline?.id === id) setBaseline({ ...baseline, label })
              }}
              onClearAll={async () => {
                if (!window.confirm('저장된 스냅샷을 모두 삭제합니다. 되돌릴 수 없습니다.')) return
                await clearAll()
                setMetas([])
                setCurrent(null)
                setBaseline(null)
                setNotice({ tone: 'info', text: '모든 스냅샷을 삭제했습니다.' })
              }}
            />
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}

function Header({
  hasData,
  busy,
  onFiles,
}: {
  hasData: boolean
  busy: boolean
  onFiles: (files: File[]) => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name="logo" size={17} className="stroke-[2.2]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight font-semibold tracking-tight">Instafloww</p>
          <p className="truncate text-[11px] text-faint">인스타그램 언팔로워 찾기</p>
        </div>
        <span className="hidden sm:block">
          <Pill tone="success">
            <Icon name="shield" size={12} />
            브라우저에서만 분석
          </Pill>
        </span>
        {hasData && <Dropzone onFiles={onFiles} busy={busy} compact />}
      </div>
    </header>
  )
}

function NoticeBar({ notice, onDismiss }: { notice: NonNullable<Notice>; onDismiss: () => void }) {
  const tones = {
    danger: 'border-danger/30 bg-danger-soft text-danger',
    success: 'border-success/25 bg-success-soft text-success',
    info: 'border-info/25 bg-info-soft text-info',
  }
  return (
    <div
      role="status"
      className={cx('mt-5 flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px]', tones[notice.tone])}
    >
      <Icon name={notice.tone === 'danger' ? 'alert' : 'check'} size={15} className="mt-px" />
      <span className="flex-1 leading-relaxed">{notice.text}</span>
      <button onClick={onDismiss} aria-label="닫기" className="opacity-60 hover:opacity-100">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

function WarningBox({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3.5 text-[12px] text-muted">
      <p className="mb-1.5 font-medium text-fg">읽는 중 건너뛴 항목</p>
      <ul className="list-inside list-disc space-y-1">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

function Landing({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  return (
    <div className="pt-12 sm:pt-20">
      <div className="mx-auto max-w-2xl text-center">
        <Pill tone="brand">로그인 · 비밀번호 · 서버 업로드 없음</Pill>
        <h1 className="mt-5 text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-5xl">
          누가 나를 <span className="text-brand">언팔로우</span>했는지
          <br className="hidden sm:block" /> 정확하게 찾아냅니다
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          인스타그램이 공식으로 제공하는 <b className="text-fg">내 정보 다운로드</b> 파일을
          이 페이지에 올리면 됩니다. 계정 정보를 요구하지 않으므로 계정이 정지될 위험도 없습니다.
        </p>
      </div>

      <div className="mt-10">
        <Dropzone onFiles={onFiles} busy={busy} />
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <FeatureCard
          title="언팔로워"
          body="두 시점의 팔로워 목록을 비교해 그 사이에 떠난 사람만 골라냅니다."
          tone="danger"
        />
        <FeatureCard
          title="짝사랑 · 팬"
          body="내가 팔로우하는데 맞팔하지 않는 계정, 반대로 나만 팔로우하는 계정을 바로 봅니다."
          tone="brand"
        />
        <FeatureCard
          title="완전한 비공개"
          body="파일 해석과 저장이 모두 이 브라우저에서 끝납니다. 분석 서버가 아예 없습니다."
          tone="success"
        />
      </div>

      <Card className="mt-10 p-5 sm:p-7">
        <h2 className="text-base font-semibold">데이터 내보내기 방법</h2>
        <p className="mt-1 mb-6 text-[13px] text-muted">
          처음 한 번만 하면 됩니다. 보통 몇 분 안에 받을 수 있습니다.
        </p>
        <Guide />
      </Card>

      <Card className="mt-4 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon name="shield" size={17} className="text-success" />
          언팔로워는 왜 두 번 올려야 하나요?
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          인스타그램 내보내기에는 <b className="text-fg">지금 팔로워가 누구인지</b>만 들어 있습니다.
          과거에 누가 팔로워였는지는 기록되지 않기 때문에, 파일 한 개만으로 언팔로워를 알아내는
          방법은 원리적으로 없습니다. 그래서 이 사이트는 올린 목록을 스냅샷으로 저장해 두고,
          다음에 올린 파일과 비교합니다.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          다만 <b className="text-fg">짝사랑 · 팬 · 맞팔</b> 분석은 지금 당장 한 개만 올려도 나옵니다.
          "팔로워를 알려준다"며 로그인을 요구하는 서비스는 비공식 접근이라 계정 정지나 계정 탈취로
          이어질 수 있습니다.
        </p>
      </Card>
    </div>
  )
}

function FeatureCard({
  title,
  body,
  tone,
}: {
  title: string
  body: string
  tone: 'danger' | 'brand' | 'success'
}) {
  const dots = { danger: 'bg-danger', brand: 'bg-brand', success: 'bg-success' }
  return (
    <Card className="p-5">
      <span className={cx('mb-3 block h-2 w-2 rounded-full', dots[tone])} />
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
    </Card>
  )
}

type TabDef = { key: TabKey; label: string; count?: number; tone?: 'danger' | 'success' }

function Dashboard({
  current,
  baseline,
  analysis,
  comparison,
  metas,
  tab,
  tabs,
  onTab,
  onPickCurrent,
  onPickBaseline,
  onDelete,
  onRename,
  onClearAll,
}: {
  current: Snapshot
  baseline: Snapshot | null
  analysis: ReturnType<typeof analyze>
  comparison: ReturnType<typeof compare> | null
  metas: SnapshotMeta[]
  tab: TabKey
  tabs: TabDef[]
  onTab: (t: TabKey) => void
  onPickCurrent: (id: string) => void
  onPickBaseline: (id: string | null) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onClearAll: () => void
}) {
  const followerDelta = comparison
    ? comparison.newFollowers.length - comparison.unfollowers.length
    : null

  return (
    <div className="pt-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="팔로워" value={analysis.followerCount} delta={followerDelta} />
        <Stat label="팔로잉" value={analysis.followingCount} />
        <Stat label="맞팔" value={analysis.mutual.length} />
        <Stat
          label="언팔로워"
          value={comparison?.unfollowers.length ?? null}
          tone="danger"
          hint={comparison ? undefined : '스냅샷 2개 필요'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
        <Icon name="clock" size={13} />
        <span>
          최신 <b className="text-muted">{current.label}</b>
        </span>
        {baseline ? (
          <>
            <span className="text-line-strong">·</span>
            <span>
              기준 <b className="text-muted">{baseline.label}</b> ({formatDateShort(baseline.createdAt)}{' '}
              → {formatDateShort(current.createdAt)})
            </span>
          </>
        ) : (
          <>
            <span className="text-line-strong">·</span>
            <span>비교 기준 없음</span>
          </>
        )}
      </div>

      <nav className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1.5 pb-1">
          {tabs.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                onClick={() => onTab(t.key)}
                className={cx(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-line-strong bg-surface-3 text-fg'
                    : 'border-transparent text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className={cx(
                      'tnum rounded-md px-1.5 py-0.5 text-[11px]',
                      t.count === 0
                        ? 'bg-surface-3 text-faint'
                        : t.tone === 'danger'
                          ? 'bg-danger-soft text-danger'
                          : t.tone === 'success'
                            ? 'bg-success-soft text-success'
                            : 'bg-surface-3 text-muted',
                    )}
                  >
                    {t.count.toLocaleString('ko-KR')}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      <Card className="mt-3 overflow-hidden">
        <TabContent
          tab={tab}
          current={current}
          baseline={baseline}
          analysis={analysis}
          comparison={comparison}
          metas={metas}
          onPickCurrent={onPickCurrent}
          onPickBaseline={onPickBaseline}
          onDelete={onDelete}
          onRename={onRename}
          onClearAll={onClearAll}
        />
      </Card>
    </div>
  )
}

function TabContent({
  tab,
  current,
  baseline,
  analysis,
  comparison,
  metas,
  onPickCurrent,
  onPickBaseline,
  onDelete,
  onRename,
  onClearAll,
}: {
  tab: TabKey
  current: Snapshot
  baseline: Snapshot | null
  analysis: ReturnType<typeof analyze>
  comparison: ReturnType<typeof compare> | null
  metas: SnapshotMeta[]
  onPickCurrent: (id: string) => void
  onPickBaseline: (id: string | null) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onClearAll: () => void
}) {
  if (tab === 'snapshots') {
    return (
      <SnapshotPanel
        metas={metas}
        currentId={current.id}
        baselineId={baseline?.id ?? null}
        onPickCurrent={onPickCurrent}
        onPickBaseline={onPickBaseline}
        onDelete={onDelete}
        onRename={onRename}
        onClearAll={onClearAll}
      />
    )
  }

  if (tab === 'unfollowers' || tab === 'newFollowers') {
    if (!comparison) return <NeedsBaseline />
    const isUnfollow = tab === 'unfollowers'
    const users = isUnfollow ? comparison.unfollowers : comparison.newFollowers
    return (
      <Section
        title={isUnfollow ? '나를 언팔로우한 사람' : '새로 생긴 팔로워'}
        description={
          isUnfollow
            ? `"${baseline!.label}" 에는 팔로워였지만 "${current.label}" 에는 없는 계정입니다.`
            : `"${baseline!.label}" 이후에 새로 나를 팔로우한 계정입니다.`
        }
        footnote={
          isUnfollow && mayContainRenames(comparison)
            ? '아이디를 바꾼 계정이나 탈퇴·비활성화·차단된 계정도 여기에 섞여 보일 수 있습니다. 같은 사람이 "새 팔로워" 에도 다른 아이디로 들어 있다면 아이디 변경입니다.'
            : undefined
        }
      >
        <UserList
          users={users}
          csvName={isUnfollow ? 'instafloww-언팔로워' : 'instafloww-새팔로워'}
          empty={
            isUnfollow ? (
              <Empty
                icon="check"
                tone="success"
                title="언팔로우한 사람이 없습니다"
                body="두 스냅샷 사이에 떠난 팔로워가 한 명도 없습니다."
              />
            ) : (
              <Empty
                icon="clock"
                title="새 팔로워가 없습니다"
                body="두 스냅샷 사이에 새로 늘어난 팔로워가 없습니다."
              />
            )
          }
        />
      </Section>
    )
  }

  const views: Record<'crush' | 'fans' | 'mutual', { title: string; description: string; users: IgUser[]; csv: string; empty: string }> = {
    crush: {
      title: '내가 팔로우하지만 맞팔하지 않는 계정',
      description: '내 팔로잉에는 있는데 내 팔로워에는 없는 계정입니다. 처음 올린 파일 하나로 바로 나옵니다.',
      users: analysis.notFollowingBack,
      csv: 'instafloww-안맞팔',
      empty: '내가 팔로우한 모든 계정이 나를 맞팔하고 있습니다.',
    },
    fans: {
      title: '나를 팔로우하지만 내가 맞팔하지 않는 계정',
      description: '내 팔로워에는 있는데 내 팔로잉에는 없는 계정입니다.',
      users: analysis.fans,
      csv: 'instafloww-팬',
      empty: '모든 팔로워를 맞팔하고 있습니다.',
    },
    mutual: {
      title: '서로 팔로우하는 계정',
      description: '내 팔로워이면서 내 팔로잉인 계정입니다.',
      users: analysis.mutual,
      csv: 'instafloww-맞팔',
      empty: '맞팔 계정이 없습니다.',
    },
  }

  const view = views[tab]
  return (
    <Section title={view.title} description={view.description}>
      <UserList
        users={view.users}
        csvName={view.csv}
        empty={<Empty icon="check" tone="success" title="해당하는 계정이 없습니다" body={view.empty} />}
      />
    </Section>
  )
}

function Section({
  title,
  description,
  footnote,
  children,
}: {
  title: string
  description: string
  footnote?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="border-b border-line px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
        {footnote && (
          <p className="mt-2.5 flex gap-2 rounded-lg border border-line bg-surface-2 p-2.5 text-[12px] leading-relaxed text-faint">
            <Icon name="alert" size={14} className="mt-px" />
            <span>{footnote}</span>
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

function NeedsBaseline() {
  return (
    <div className="px-5 py-16 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-info/30 bg-info-soft text-info">
        <Icon name="clock" size={20} />
      </span>
      <p className="text-sm font-semibold">아직 비교할 스냅샷이 없습니다</p>
      <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        인스타그램 내보내기에는 "지금"의 팔로워만 들어 있어서, 언팔로워는 두 시점을 비교해야
        알 수 있습니다. 1~2주 뒤에 내보내기를 한 번 더 받아 올려 주세요.
      </p>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-muted">
        그동안 <b className="text-fg">짝사랑</b> 과 <b className="text-fg">팬</b> 탭은 지금 바로
        볼 수 있습니다.
      </p>
    </div>
  )
}

function Empty({
  icon,
  tone = 'neutral',
  title,
  body,
}: {
  icon: 'check' | 'clock'
  tone?: 'neutral' | 'success'
  title: string
  body: string
}) {
  return (
    <>
      <span
        className={cx(
          'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border',
          tone === 'success'
            ? 'border-success/30 bg-success-soft text-success'
            : 'border-line bg-surface-2 text-muted',
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
    </>
  )
}

function Stat({
  label,
  value,
  delta,
  tone,
  hint,
}: {
  label: string
  value: number | null
  delta?: number | null
  tone?: 'danger'
  hint?: string
}) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p
        className={cx(
          'tnum mt-1.5 text-2xl font-semibold tracking-tight',
          value === null ? 'text-faint' : tone === 'danger' && value > 0 ? 'text-danger' : 'text-fg',
        )}
      >
        {value === null ? '—' : value.toLocaleString('ko-KR')}
      </p>
      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
      {delta !== null && delta !== undefined && delta !== 0 && (
        <p
          className={cx(
            'tnum mt-1 text-[11px] font-medium',
            delta > 0 ? 'text-success' : 'text-danger',
          )}
        >
          {delta > 0 ? '+' : ''}
          {delta.toLocaleString('ko-KR')} (기준 대비)
        </p>
      )}
    </Card>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-[12px] leading-relaxed text-faint">
          Instafloww 는 인스타그램 공식 데이터 내보내기 파일만 사용합니다. 계정 로그인 정보를
          요구하지 않고, 분석 결과를 어디에도 전송하지 않습니다. 저장된 스냅샷은 이 브라우저의
          IndexedDB 에만 있으며, 브라우저 데이터를 지우면 함께 사라집니다.
        </p>
        <p className="mt-2 text-[12px] text-faint">
          Instagram 은 Meta Platforms, Inc. 의 상표이며 이 프로젝트와 아무 관련이 없습니다.
        </p>
      </div>
    </footer>
  )
}
