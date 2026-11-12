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
import { Card, Icon, InfoBox, Pill, Spinner, cx, formatDay, formatRange } from './components/ui'

type TabKey = 'unfollowers' | 'crush' | 'fans' | 'newFollowers' | 'mutual' | 'snapshots'

type Notice = { tone: 'red' | 'green' | 'neutral'; text: string } | null

function newSnapshotLabel(createdAt: number, existing: SnapshotMeta[]) {
  const base = formatDay(createdAt)
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
            tone: 'red',
            text: `저장된 스냅샷을 불러오지 못했어요: ${
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
            tone: 'red',
            text:
              '파일에서 팔로워·팔로잉 목록을 찾지 못했어요. 내보내기에 "팔로워 및 팔로잉"이 포함됐는지 확인해 주세요.',
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
          tone: 'green',
          text: prevNewest
            ? `스냅샷을 저장했어요. ‘${prevNewest.label}’과 비교해서 언팔로워를 찾았어요.`
            : `첫 스냅샷을 저장했어요. 팔로워 ${result.followers.length.toLocaleString(
                'ko-KR',
              )}명, 팔로잉 ${result.following.length.toLocaleString('ko-KR')}명이에요.`,
        })
        setTab(prevNewest ? 'unfollowers' : 'crush')
      } catch (err) {
        setNotice({
          tone: 'red',
          text: err instanceof Error ? err.message : '파일을 읽는 중에 문제가 생겼어요.',
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

  const tabs = useMemo<TabDef[]>(
    () => [
      { key: 'unfollowers', label: '언팔로워', count: comparison?.unfollowers.length, tone: 'red' },
      { key: 'crush', label: '짝사랑', count: analysis?.notFollowingBack.length },
      { key: 'fans', label: '팬', count: analysis?.fans.length },
      { key: 'newFollowers', label: '새 팔로워', count: comparison?.newFollowers.length, tone: 'green' },
      { key: 'mutual', label: '맞팔', count: analysis?.mutual.length },
      { key: 'snapshots', label: '스냅샷', count: metas.length },
    ],
    [analysis, comparison, metas.length],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-faint">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  const hasData = current !== null

  return (
    <div className="min-h-screen">
      <Header hasData={hasData} busy={busy} onFiles={handleFiles} />

      <main className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-5">
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
              if (!window.confirm('저장된 스냅샷을 모두 삭제해요. 되돌릴 수 없어요.')) return
              await clearAll()
              setMetas([])
              setCurrent(null)
              setBaseline(null)
              setNotice({ tone: 'neutral', text: '스냅샷을 모두 삭제했어요.' })
            }}
          />
        )}
      </main>

      <Footer />
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
    <header className="sticky top-0 z-20 bg-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[720px] items-center gap-2.5 px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-blue text-white">
          <Icon name="logo" size={19} strokeWidth={2.4} />
        </span>
        <p className="display flex-1 text-[18px] font-bold">Instafloww</p>
        {hasData ? (
          <Dropzone onFiles={onFiles} busy={busy} compact />
        ) : (
          <Pill tone="green">
            <Icon name="lock" size={13} strokeWidth={2.2} />
            브라우저에서만 분석
          </Pill>
        )}
      </div>
    </header>
  )
}

function NoticeBar({ notice, onDismiss }: { notice: NonNullable<Notice>; onDismiss: () => void }) {
  const tones = {
    red: 'bg-red-weak text-red',
    green: 'bg-green-weak text-green',
    neutral: 'bg-sunken text-muted',
  }
  return (
    <div
      role="status"
      className={cx('mt-4 flex items-start gap-2.5 rounded-2xl p-4 text-[15px]', tones[notice.tone])}
    >
      <Icon name={notice.tone === 'red' ? 'info' : 'check'} size={18} className="mt-0.5" />
      <span className="ko flex-1 leading-[1.6] font-medium">{notice.text}</span>
      <button onClick={onDismiss} aria-label="닫기" className="mt-0.5 opacity-55 hover:opacity-100">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

function WarningBox({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-3 rounded-2xl bg-sunken p-4 text-[14px] text-muted">
      <p className="mb-1.5 font-semibold text-fg-2">건너뛴 파일</p>
      <ul className="ko list-inside list-disc space-y-1 leading-[1.6]">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

function Landing({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  return (
    <div className="pt-10 sm:pt-16">
      <div className="text-center">
        <h1 className="display text-[34px] leading-[1.32] font-bold sm:text-[48px]">
          누가 나를
          <br />
          <span className="text-blue">언팔로우</span>했을까요?
        </h1>
        <p className="ko mx-auto mt-4 max-w-[400px] text-[16px] leading-[1.65] text-muted sm:text-[17px]">
          인스타그램에서 받은 내 정보 파일만 올리면 돼요.
          <br className="hidden sm:block" /> 로그인도, 비밀번호도 필요 없어요.
        </p>
      </div>

      <div className="mt-9">
        <Dropzone onFiles={onFiles} busy={busy} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FeatureCard
          tone="red"
          title="언팔로워"
          body="두 시점의 팔로워를 비교해서, 그 사이에 떠난 사람만 골라내요."
        />
        <FeatureCard
          tone="blue"
          title="짝사랑 · 팬"
          body="내가 팔로우하는데 맞팔하지 않는 계정을 바로 확인할 수 있어요."
        />
        <FeatureCard
          tone="green"
          title="완전한 비공개"
          body="파일을 읽고 저장하는 일이 모두 이 브라우저 안에서 끝나요."
        />
      </div>

      <Card className="mt-3 p-5 sm:p-7">
        <h2 className="display text-[20px] font-bold">데이터 내보내는 방법</h2>
        <p className="ko mt-1.5 mb-7 text-[15px] text-muted">
          처음 한 번만 하면 돼요. 보통 몇 분 안에 받을 수 있어요.
        </p>
        <Guide />
      </Card>

      <Card className="mt-3 p-5 sm:p-7">
        <h2 className="display text-[20px] leading-[1.4] font-bold">
          언팔로워는 왜 두 번 올려야 하나요?
        </h2>
        <p className="ko mt-3.5 text-[15px] leading-[1.7] text-muted">
          인스타그램 내보내기에는 <b className="font-semibold text-fg-2">지금 팔로워가 누구인지</b>만
          들어 있어요. 과거에 누가 팔로워였는지는 기록되지 않아서, 파일 하나만으로 언팔로워를
          알아내는 방법은 원리적으로 없어요. 그래서 올린 목록을 스냅샷으로 저장해 두고, 다음에
          올린 파일과 비교해요.
        </p>
        <p className="ko mt-3.5 text-[15px] leading-[1.7] text-muted">
          대신 <b className="font-semibold text-fg-2">짝사랑 · 팬 · 맞팔</b>은 지금 하나만 올려도
          바로 볼 수 있어요.
        </p>
        <div className="mt-5">
          <InfoBox icon="lock">
            “팔로워를 알려준다”면서 로그인을 요구하는 서비스는 비공식 접근이라, 계정이 정지되거나
            탈취될 수 있어요. Instafloww는 계정 정보를 아예 받지 않아요.
          </InfoBox>
        </div>
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
  tone: 'red' | 'blue' | 'green'
}) {
  const dots = { red: 'bg-red', blue: 'bg-blue', green: 'bg-green' }
  return (
    <Card className="p-5">
      <span className={cx('mb-3 block h-2.5 w-2.5 rounded-full', dots[tone])} />
      <p className="text-[17px] font-bold">{title}</p>
      <p className="ko mt-1.5 text-[14px] leading-[1.6] text-muted">{body}</p>
    </Card>
  )
}

type TabDef = { key: TabKey; label: string; count?: number; tone?: 'red' | 'green' }

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
    <div className="pt-5">
      {/* 지금 무엇과 무엇을 비교하고 있는지 */}
      <div className="mb-3 flex items-center gap-2 px-1 text-[13px] text-faint">
        <Icon name="clock" size={14} />
        {baseline ? (
          <span className="tnum">{formatRange(baseline.createdAt, current.createdAt)} 비교</span>
        ) : (
          <span>{formatDay(current.createdAt)} 스냅샷 · 비교 기준 없음</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="팔로워" value={analysis.followerCount} delta={followerDelta} />
        <Stat
          label="언팔로워"
          value={comparison?.unfollowers.length ?? null}
          tone="red"
          hint={comparison ? undefined : '스냅샷 2개가 필요해요'}
        />
        <Stat label="팔로잉" value={analysis.followingCount} />
        <Stat label="맞팔" value={analysis.mutual.length} />
      </div>

      <nav className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <div className="flex gap-2 pb-1">
          {tabs.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                onClick={() => onTab(t.key)}
                className={cx(
                  'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors',
                  active ? 'bg-blue text-white' : 'bg-card text-muted shadow-card hover:text-fg',
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span
                    className={cx(
                      'tnum rounded-full px-1.5 py-0.5 text-[12px] font-bold',
                      active
                        ? 'bg-white/22 text-white'
                        : t.count === 0
                          ? 'bg-bg text-faint'
                          : t.tone === 'red'
                            ? 'bg-red-weak text-red'
                            : t.tone === 'green'
                              ? 'bg-green-weak text-green'
                              : 'bg-bg text-muted',
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
      <Section title="저장된 스냅샷">
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
      </Section>
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
            ? `‘${baseline!.label}’에는 팔로워였지만 ‘${current.label}’에는 없는 계정이에요.`
            : `‘${baseline!.label}’ 이후에 새로 나를 팔로우한 계정이에요.`
        }
        footnote={
          isUnfollow && mayContainRenames(comparison)
            ? '아이디를 바꾼 계정이나 탈퇴·비활성화·차단된 계정도 여기에 섞여 보일 수 있어요. 같은 사람이 ‘새 팔로워’에도 다른 아이디로 있다면 아이디를 바꾼 거예요.'
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
                tone="green"
                title="언팔로우한 사람이 없어요"
                body="두 스냅샷 사이에 떠난 팔로워가 한 명도 없어요."
              />
            ) : (
              <Empty
                icon="clock"
                title="새 팔로워가 없어요"
                body="두 스냅샷 사이에 새로 늘어난 팔로워가 없어요."
              />
            )
          }
        />
      </Section>
    )
  }

  const views: Record<
    'crush' | 'fans' | 'mutual',
    { title: string; description: string; users: IgUser[]; csv: string; empty: string }
  > = {
    crush: {
      title: '내가 팔로우하지만 맞팔하지 않는 계정',
      description: '내 팔로잉에는 있는데 내 팔로워에는 없는 계정이에요. 파일 하나로 바로 나와요.',
      users: analysis.notFollowingBack,
      csv: 'instafloww-안맞팔',
      empty: '내가 팔로우한 모든 계정이 나를 맞팔하고 있어요.',
    },
    fans: {
      title: '나를 팔로우하지만 내가 맞팔하지 않는 계정',
      description: '내 팔로워에는 있는데 내 팔로잉에는 없는 계정이에요.',
      users: analysis.fans,
      csv: 'instafloww-팬',
      empty: '모든 팔로워를 맞팔하고 있어요.',
    },
    mutual: {
      title: '서로 팔로우하는 계정',
      description: '내 팔로워이면서 내 팔로잉인 계정이에요.',
      users: analysis.mutual,
      csv: 'instafloww-맞팔',
      empty: '맞팔 계정이 없어요.',
    },
  }

  const view = views[tab]
  return (
    <Section title={view.title} description={view.description}>
      <UserList
        users={view.users}
        csvName={view.csv}
        empty={<Empty icon="check" tone="green" title="해당하는 계정이 없어요" body={view.empty} />}
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
  description?: string
  footnote?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="px-4 pt-5 pb-4 sm:px-5">
        <h2 className="display text-[19px] leading-[1.4] font-bold">{title}</h2>
        {description && (
          <p className="ko mt-1.5 text-[15px] leading-[1.6] text-muted">{description}</p>
        )}
        {footnote && (
          <div className="mt-4">
            <InfoBox>{footnote}</InfoBox>
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

function NeedsBaseline() {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-blue-weak text-blue">
        <Icon name="clock" size={28} />
      </span>
      <p className="display text-[19px] font-bold">아직 비교할 스냅샷이 없어요</p>
      <p className="ko mx-auto mt-2.5 max-w-[380px] text-[15px] leading-[1.65] text-muted">
        인스타그램 내보내기에는 ‘지금’의 팔로워만 들어 있어서, 언팔로워는 두 시점을 비교해야 알 수
        있어요. 1~2주 뒤에 한 번 더 받아서 올려주세요.
      </p>
      <p className="ko mx-auto mt-3 max-w-[380px] text-[15px] leading-[1.65] text-muted">
        그동안 <b className="font-semibold text-fg-2">짝사랑</b>과{' '}
        <b className="font-semibold text-fg-2">팬</b> 탭은 지금 바로 볼 수 있어요.
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
  tone?: 'neutral' | 'green'
  title: string
  body: string
}) {
  return (
    <>
      <span
        className={cx(
          'mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px]',
          tone === 'green' ? 'bg-green-weak text-green' : 'bg-sunken text-faint',
        )}
      >
        <Icon name={icon} size={28} />
      </span>
      <p className="display text-[19px] font-bold">{title}</p>
      <p className="ko mx-auto mt-2.5 max-w-[340px] text-[15px] leading-[1.65] text-muted">{body}</p>
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
  tone?: 'red'
  hint?: string
}) {
  return (
    <Card className="p-5">
      <p className="text-[14px] font-medium text-muted">{label}</p>
      <p
        className={cx(
          'tnum display mt-1 text-[30px] leading-[1.25] font-bold',
          value === null ? 'text-line-strong' : tone === 'red' && value > 0 ? 'text-red' : 'text-fg',
        )}
      >
        {value === null ? '—' : value.toLocaleString('ko-KR')}
      </p>
      {hint && <p className="ko mt-1 text-[12px] text-faint">{hint}</p>}
      {delta !== null && delta !== undefined && delta !== 0 && (
        <p className={cx('tnum mt-1 text-[13px] font-semibold', delta > 0 ? 'text-green' : 'text-red')}>
          {delta > 0 ? '+' : ''}
          {delta.toLocaleString('ko-KR')}
        </p>
      )}
    </Card>
  )
}

function Footer() {
  return (
    <footer className="mx-auto w-full max-w-[720px] px-5 pb-12">
      <p className="ko text-[13px] leading-[1.7] text-faint">
        Instafloww는 인스타그램 공식 데이터 내보내기 파일만 사용해요. 계정 로그인 정보를 요구하지
        않고, 분석 결과를 어디에도 전송하지 않아요. 저장된 스냅샷은 이 브라우저의 IndexedDB에만
        있어서, 브라우저 데이터를 지우면 함께 사라져요.
      </p>
      <p className="ko mt-2 text-[13px] text-faint">
        Instagram은 Meta Platforms, Inc.의 상표이며 이 프로젝트와 아무 관련이 없어요.
      </p>
    </footer>
  )
}
