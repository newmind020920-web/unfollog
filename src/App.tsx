import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { IgUser, Snapshot, SnapshotMeta } from './types'
import {
  analyze,
  compare,
  departureTracker,
  type Analysis,
  type Comparison,
  type Departure,
  type DepartureTrace,
} from './lib/analyze'
import {
  clearAll,
  deleteSnapshot,
  eachSnapshotOldestFirst,
  getSnapshot,
  isPersistent,
  listSnapshots,
  putSnapshot,
  renameSnapshot,
} from './lib/db'
import { parseFiles } from './lib/parse'
import { AnalyzeProgress, type Progress, type Step } from './components/Progress'
import { buildReminderIcs, daysFromNow } from './lib/reminder'
import { download } from './lib/export'
import { ping } from './lib/visit'
import { loadGone, markGone } from './lib/gone'
import { Dropzone } from './components/Dropzone'
import { ContactForm } from './components/ContactForm'
import { buildMeta, CAN_CONTACT } from './lib/contact'
import { Guide } from './components/Guide'
import { SnapshotPanel } from './components/SnapshotPanel'
import { UserList, type Timeline } from './components/UserList'
import {
  Button,
  Card,
  Icon,
  InfoBox,
  Pill,
  Spinner,
  cx,
  formatAgo,
  formatDay,
  formatRange,
  formatSpan,
  type IconName,
} from './components/ui'

/** 화면 이름 = 주소의 #뒤. 뒤로 가기와 링크 공유가 그대로 동작합니다. */
const VIEWS = [
  'home',
  'unfollowers',
  'blocked',
  'renamed',
  'new-followers',
  'followers',
  'following',
  'mutual',
  'not-following-back',
  'snapshots',
  'contact',
] as const
type View = (typeof VIEWS)[number]
type ListView = Exclude<View, 'home' | 'snapshots' | 'contact'>

type Tone = 'red' | 'green' | 'brand' | 'neutral'
type Notice = { tone: 'red' | 'green' | 'neutral'; text: string } | null

type ListDef = {
  view: ListView
  /** 메뉴와 상세 화면 제목에 그대로 쓰는 이름 */
  label: string
  description: string
  icon: IconName
  tone: Tone
  /** null = 비교할 스냅샷이 아직 없음 */
  users: IgUser[] | null
  /** 세어서 보여줄 수. 없으면 users 의 길이를 씁니다 */
  count?: number
  /** 떠난 시점 — 구간이 둘 이상일 때만 채웁니다 */
  timeline?: Timeline
  /** 행 아래 설명 (떠난 시점 대신) */
  notes?: Map<string, string>
  /** 이름 옆 꼬리표 */
  tags?: Map<string, string>
  /** 목록 위 안내문 */
  footnote?: string
  /** 숫자만 나란히 보여줄 때 쓰는 짧은 이름 */
  short?: string
  csv: string
  emptyTitle: string
  emptyBody: string
}

function readHash(): View {
  try {
    const name = window.location.hash.replace(/^#/, '')
    return (VIEWS as readonly string[]).includes(name) ? (name as View) : 'home'
  } catch {
    return 'home'
  }
}

/** 주소의 # 과 화면 상태를 맞춥니다. 해시를 못 쓰는 환경에서도 상태만으로 동작합니다. */
function useView() {
  const [view, setView] = useState<View>(readHash)
  const depth = useRef(0)

  useEffect(() => {
    const onHash = () => setView(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  const go = useCallback((next: View) => {
    setView(next)
    try {
      if (next === 'home') {
        depth.current = 0
        if (window.location.hash) window.location.hash = ''
      } else {
        depth.current += 1
        window.location.hash = next
      }
    } catch {
      /* 해시를 바꿀 수 없는 환경 — 상태만 씁니다 */
    }
  }, [])

  const back = useCallback(() => {
    // 앱 안에서 들어온 화면이면 브라우저 기록을 한 칸 되돌려 기록이 쌓이지 않게 합니다.
    if (depth.current > 0) {
      depth.current -= 1
      try {
        window.history.back()
        return
      } catch {
        /* 아래로 */
      }
    }
    go('home')
  }, [go])

  return { view, go, back }
}

function newSnapshotLabel(createdAt: number, existing: SnapshotMeta[]) {
  const base = formatDay(createdAt)
  const sameDay = existing.filter((m) => m.label.startsWith(base)).length
  return sameDay ? `${base} (${sameDay + 1})` : base
}

const num = (n: number) => n.toLocaleString('ko-KR')

/** 초 단위 시각을 "2025년 5월" 로. 파일이 담고 있는 기간을 말할 때 씁니다. */
const monthLabel = (sec: number) =>
  new Date(sec * 1000).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })

/**
 * 분석은 보통 눈 깜짝할 사이에 끝납니다. 그대로 두면 무엇을 읽었는지
 * 보이지 않고 결과만 튀어나와서, 제대로 처리됐는지 믿기 어렵습니다.
 * 그래서 각 단계가 읽힐 만큼만 머물게 합니다. 단계 자체는 실제로 하는 일입니다.
 */
const MIN_STEP_MS = 420

function createPacer(minMs: number) {
  let last = performance.now()
  return async () => {
    const remaining = minMs - (performance.now() - last)
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    last = performance.now()
  }
}

/**
 * "3일 전쯤 · 11월 5~12일 사이" — 떠난 시점은 두 스냅샷 사이 구간으로만 알 수 있으므로,
 * 구간의 가운데를 어림값으로 쓰고 구간 자체를 같이 보여줍니다.
 */
function departureLabel(d: Departure, now: number) {
  const span = formatSpan(d.lastSeenAt, d.goneByAt)
  const ago = formatAgo((d.lastSeenAt + d.goneByAt) / 2, now)
  const approx = ago === '오늘' || ago === '어제' ? ago : `${ago}쯤`
  return span.sameDay ? `${approx} · ${span.text}` : `${approx} · ${span.text} 사이`
}

function buildTimeline(trace: DepartureTrace, now: number): Timeline | undefined {
  // 구간이 하나뿐이면 모든 행에 같은 문구가 붙어 의미가 없습니다.
  if (trace.windowCount < 2) return undefined
  return new Map(
    trace.departures.map((d) => [
      d.user.username,
      { lastSeenAt: d.lastSeenAt, goneByAt: d.goneByAt, label: departureLabel(d, now) },
    ]),
  )
}

export default function App() {
  const [metas, setMetas] = useState<SnapshotMeta[]>([])
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [baseline, setBaseline] = useState<Snapshot | null>(null)
  const [trace, setTrace] = useState<DepartureTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  // 프로필을 열어 "사라졌다"고 확인한 계정. 언팔 목록에서 빼 줍니다.
  const [gone, setGone] = useState<Set<string>>(() => loadGone())
  const [notice, setNotice] = useState<Notice>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [persistent, setPersistent] = useState(true)
  const { view, go, back } = useView()

  // 저장 완료 같은 알림은 홈에서만 의미가 있으므로 다른 화면으로 가면 치웁니다.
  useEffect(() => {
    if (view !== 'home') setNotice((n) => (n && n.tone !== 'red' ? null : n))
  }, [view])

  /**
   * 지정한 스냅샷을 보고, 비교 시작 지점을 정합니다.
   * 기본값은 가장 오래된 스냅샷 — 저장해 둔 기록 전체를 보여주고,
   * 중간 스냅샷이 있으면 사람마다 떠난 시점을 좁힐 수 있습니다.
   */
  const selectPair = useCallback(
    async (list: SnapshotMeta[], currentId: string | null, baselineId?: string | null) => {
      if (!currentId) {
        setCurrent(null)
        setBaseline(null)
        setTrace(null)
        return
      }
      const curr = await getSnapshot(currentId)
      if (!curr) {
        setCurrent(null)
        setBaseline(null)
        setTrace(null)
        return
      }

      const older = list.filter((m) => m.createdAt < curr.createdAt && m.id !== curr.id)
      const resolvedBaselineId =
        baselineId !== undefined ? baselineId : (older[older.length - 1]?.id ?? null)
      const base = resolvedBaselineId ? ((await getSnapshot(resolvedBaselineId)) ?? null) : null

      // 시작 지점부터 지금 보는 스냅샷까지 훑어 떠난 시점을 좁힙니다.
      const tracker = departureTracker()
      await eachSnapshotOldestFirst((snap) => tracker.add(snap), {
        from: base?.createdAt,
        to: curr.createdAt,
        preloaded: curr,
      })

      // 셋을 한꺼번에 반영합니다. 먼저 반영하면 떠난 사람을 아직 세지 못한
      // 중간 상태가 한 번 그려져서 첫 문장이 깜빡입니다.
      setCurrent(curr)
      setBaseline(base)
      setTrace(tracker.result())
    },
    [],
  )

  const refresh = useCallback(
    async (currentId?: string | null) => {
      const list = await listSnapshots()
      setMetas(list)
      setPersistent(isPersistent())
      await selectPair(list, currentId === undefined ? (list[0]?.id ?? null) : currentId)
      return list
    },
    [selectPair],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await refresh()
        ping({ snapshots: list.length })
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
  }, [refresh])

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true)
      setNotice(null)
      setWarnings([])

      const pace = createPacer(MIN_STEP_MS)
      const counts = { followers: 0, following: 0 }
      const show = async (step: Step) => {
        setProgress({ step, ...counts })
        await pace()
      }

      try {
        const result = await parseFiles(files, async ({ stage, count }) => {
          if (stage === 'followers') counts.followers = count
          if (stage === 'following') counts.following = count
          await show(stage)
        })
        setWarnings(result.warnings)

        if (!result.followers.length && !result.following.length) {
          setNotice({
            tone: 'red',
            text:
              '파일에서 팔로워·팔로잉 목록을 찾지 못했어요. 내보내기에 "팔로워 및 팔로잉"이 포함됐는지 확인해 주세요.',
          })
          return
        }

        counts.followers = result.followers.length
        counts.following = result.following.length
        await show('comparing')

        await show('saving')

        const createdAt = Date.now()
        const existing = await listSnapshots()
        const snapshot: Snapshot = {
          id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt,
          label: newSnapshotLabel(createdAt, existing),
          followers: result.followers,
          following: result.following,
          // 누가 끊었는지 가리는 근거 — 파일이 없었으면 undefined 로 둡니다.
          ...(result.unfollowedByMe ? { unfollowedByMe: result.unfollowedByMe } : {}),
          ...(result.blockedByMe ? { blockedByMe: result.blockedByMe } : {}),
          sources: result.sources,
          coverage: result.coverage,
        }
        await putSnapshot(snapshot)
        const saved = await refresh(snapshot.id)
        ping({ uploaded: true, snapshots: saved.length })

        // 양쪽 다 많은데 겹치는 사람이 하나도 없으면 파일을 잘못 읽었을 가능성이 큽니다.
        // 숫자는 그럴듯해 보여도 전부 틀리므로 조용히 넘어가면 안 됩니다.
        // 다만 막지는 않습니다 — 맞팔이 정말 없는 계정도 있습니다.
        const followerKeys = new Set(result.followers.map((u) => u.username))
        const noOverlap =
          result.followers.length >= 10 &&
          result.following.length >= 10 &&
          !result.following.some((u) => followerKeys.has(u.username))

        const prevNewest = existing[0]
        const narrowed = result.coverage?.likelyNarrowed
        setNotice(
          narrowed
            ? {
                tone: 'red',
                text:
                  `이 파일에는 ${monthLabel(result.coverage!.first)}부터의 기록만 담겨 있어요. ` +
                  '그 전부터 인스타를 쓰셨다면 내보낼 때 기간이 ‘전체’가 아니어서 숫자가 적게 ' +
                  '나온 거예요. 기간을 ‘전체’로 다시 내보내 주세요.',
              }
            : noOverlap
            ? {
                tone: 'red',
                text:
                  '저장은 했지만, 팔로워와 팔로잉에 겹치는 사람이 한 명도 없어요. ' +
                  '파일을 제대로 읽지 못했을 수 있어요. 내보내기를 JSON 형식으로 다시 받아서 올려보세요.',
              }
            : {
                tone: 'green',
                text: prevNewest
                  ? `저장했어요. ‘${prevNewest.label}’ 스냅샷과 비교한 결과예요.`
                  : `저장했어요. 팔로워 ${num(result.followers.length)}명, 팔로잉 ${num(
                      result.following.length,
                    )}명을 읽었어요.`,
              },
        )
        go('home')
      } catch (err) {
        setNotice({
          tone: 'red',
          text: err instanceof Error ? err.message : '파일을 읽는 중에 문제가 생겼어요.',
        })
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [go, refresh],
  )

  const analysis = useMemo(() => (current ? analyze(current) : null), [current])
  const comparison = useMemo(
    () => (current && baseline ? compare(baseline, current) : null),
    [current, baseline],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-48 text-faint">
        <Spinner className="h-7 w-7" />
      </div>
    )
  }

  const hasData = current !== null && analysis !== null

  return (
    <div>
      <Header hasData={hasData} busy={busy} onFiles={handleFiles} onHome={() => go('home')} />

      <main className="gutter mx-auto w-full max-w-[680px] pb-24">
        {notice && <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />}
        {warnings.length > 0 && <WarningBox warnings={warnings} />}

        {view === 'contact' ? (
          <Detail title="문의하기" onBack={() => go('home')}>
            <p className="ko px-4 pb-4 text-[15px] leading-[1.65] text-muted sm:px-5">
              안 되는 것, 숫자가 이상한 것, 있었으면 하는 것 무엇이든 적어주세요. 직접 읽고
              고칩니다.
            </p>
            <ContactForm meta={buildMeta(current, metas.length)} />
          </Detail>
        ) : progress ? (
          <div className="pt-6">
            <AnalyzeProgress progress={progress} />
          </div>
        ) : !hasData ? (
          <Landing busy={busy} onFiles={handleFiles} />
        ) : (
          <Workspace
            view={view}
            go={go}
            back={back}
            onFiles={handleFiles}
            busy={busy}
            current={current}
            baseline={baseline}
            analysis={analysis}
            comparison={comparison}
            trace={trace}
            gone={gone}
            onToggleGone={(name, isGone) => setGone(markGone(name, isGone))}
            metas={metas}
            persistent={persistent}
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
              if (current.id === id) {
                // 보던 스냅샷을 지웠으면 가장 최근 것으로 넘어갑니다.
                await selectPair(list, list[0]?.id ?? null)
              } else if (baseline?.id === id) {
                // 비교 기준을 지웠으면 기준을 다시 고릅니다.
                await selectPair(list, current.id)
              } else {
                await selectPair(list, current.id, baseline?.id ?? null)
              }
              if (!list.length) go('home')
            }}
            onRename={async (id, label) => {
              await renameSnapshot(id, label)
              setMetas(await listSnapshots())
              if (current.id === id) setCurrent({ ...current, label })
              if (baseline?.id === id) setBaseline({ ...baseline, label })
            }}
            onClearAll={async () => {
              await clearAll()
              setMetas([])
              setCurrent(null)
              setBaseline(null)
              setNotice({ tone: 'neutral', text: '스냅샷을 모두 삭제했어요.' })
              go('home')
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
  onHome,
}: {
  hasData: boolean
  busy: boolean
  onFiles: (files: File[]) => void
  onHome: () => void
}) {
  return (
    <header className="sticky-header sticky z-20 bg-bg/85 backdrop-blur-xl">
      <div className="gutter mx-auto flex w-full max-w-[680px] items-center gap-2.5 py-3">
        <button onClick={onHome} className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="처음 화면으로">
          <span className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-white">
            <Icon name="logo" size={19} strokeWidth={3.4} />
          </span>
          <span className="display truncate text-[18px] font-bold">언팔로그</span>
        </button>
        {hasData ? (
          <Dropzone onFiles={onFiles} busy={busy} compact label="재업로드" />
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
    neutral: 'bg-card text-muted shadow-card',
  }
  return (
    <div
      role="status"
      className={cx('mt-3 flex items-start gap-2.5 rounded-2xl p-4 text-[15px]', tones[notice.tone])}
    >
      <Icon name={notice.tone === 'red' ? 'info' : 'check'} size={18} className="mt-0.5" />
      <span className="ko min-w-0 flex-1 leading-[1.6] font-medium">{notice.text}</span>
      <button onClick={onDismiss} aria-label="닫기" className="mt-0.5 opacity-55 hover:opacity-100">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}

function WarningBox({ warnings }: { warnings: string[] }) {
  return (
    <div className="mt-3 rounded-2xl bg-card p-4 text-[14px] text-muted shadow-card">
      <p className="mb-1.5 font-semibold text-fg-2">건너뛴 파일</p>
      <ul className="ko list-inside list-disc space-y-1 leading-[1.6]">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

/* ───────────────────────── 처음 화면 ───────────────────────── */

function Landing({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  return (
    <div className="pt-10 sm:pt-14">
      <div className="text-center">
        <h1 className="display text-[34px] leading-[1.32] font-bold sm:text-[46px]">
          누가 나를
          <br />
          <span className="text-brand">언팔</span>했을까요?
        </h1>
        <p className="ko mx-auto mt-4 max-w-[400px] text-[16px] leading-[1.65] text-muted sm:text-[17px]">
          인스타그램에서 받은 내 정보 파일만 올리면 돼요.
          <br className="hidden sm:block" /> 로그인도, 비밀번호도 필요 없어요.
        </p>
      </div>

      <div className="mt-9">
        <Dropzone onFiles={onFiles} busy={busy} />
      </div>

      <Card className="mt-3 p-5 sm:p-7">
        <h2 className="display text-[20px] font-bold">데이터 내보내는 방법</h2>
        <p className="ko mt-1.5 mb-7 text-[15px] text-muted">
          파일이 없다면 여기부터. 처음 한 번만 하면 되고, 보통 몇 분 안에 받을 수 있어요.
        </p>
        <Guide />
      </Card>

      <Card className="mt-3 px-5 py-2">
        <ul>
          <PreviewRow icon="userX" tone="brand" label="나를 맞팔하지 않는 사람" body="파일 하나만 올려도 바로 나와요" />
          <PreviewRow icon="userMinus" tone="red" label="나를 언팔한 사람" body="누가, 대략 언제 떠났는지 찾아요" />
          <PreviewRow icon="ban" tone="red" label="차단 의심 계정" body="서로 팔로우하다 양쪽에서 동시에 사라진 계정" last />
        </ul>
      </Card>

      <Card className="mt-3 p-5 sm:p-7">
        <h2 className="display text-[20px] leading-[1.4] font-bold">
          나를 언팔한 사람은 왜 두 번 올려야 알 수 있나요?
        </h2>
        <p className="ko mt-3.5 text-[15px] leading-[1.7] text-muted">
          인스타그램 내보내기에는 <b className="font-semibold text-fg-2">지금 팔로워가 누구인지</b>만
          들어 있어요. 과거에 누가 팔로워였는지는 기록되지 않아서, 파일 하나만으로는 누가 떠났는지
          알 수 없어요. 그래서 올린 목록을 저장해 두고, 다음에 올린 파일과 비교해요.
        </p>
        <p className="ko mt-3.5 text-[15px] leading-[1.7] text-muted">
          <b className="font-semibold text-fg-2">나를 팔로우하는 사람, 나를 맞팔하지 않는 사람</b>{' '}
          같은 지금의 관계는 파일 하나만 올려도 바로 볼 수 있어요.
        </p>
        <div className="mt-5">
          <InfoBox icon="lock">
            “팔로워를 알려준다”면서 로그인을 요구하는 서비스는 비공식 접근이라, 계정이 정지되거나
            탈취될 수 있어요. 언팔로그는 계정 정보를 아예 받지 않아요.
          </InfoBox>
        </div>
      </Card>
    </div>
  )
}

function PreviewRow({
  icon,
  tone,
  label,
  body,
  last,
}: {
  icon: IconName
  tone: Tone
  label: string
  body: string
  last?: boolean
}) {
  return (
    <li className={cx('flex items-center gap-3.5 py-3.5', !last && 'border-b border-line')}>
      <IconBadge icon={icon} tone={tone} />
      <div className="min-w-0">
        <p className="text-[16px] font-bold">{label}</p>
        <p className="ko mt-0.5 text-[14px] text-muted">{body}</p>
      </div>
    </li>
  )
}

function IconBadge({ icon, tone }: { icon: IconName; tone: Tone }) {
  const tones = {
    red: 'bg-red-weak text-red',
    green: 'bg-green-weak text-green',
    brand: 'bg-brand-weak text-brand',
    neutral: 'bg-sunken text-muted',
  }
  return (
    <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', tones[tone])}>
      <Icon name={icon} size={21} />
    </span>
  )
}

/* ───────────────────────── 분석 화면 ───────────────────────── */

type WorkspaceProps = {
  view: View
  go: (v: View) => void
  back: () => void
  current: Snapshot
  baseline: Snapshot | null
  analysis: Analysis
  comparison: Comparison | null
  trace: DepartureTrace | null
  gone: Set<string>
  onToggleGone: (username: string, gone: boolean) => void
  metas: SnapshotMeta[]
  persistent: boolean
  onPickCurrent: (id: string) => void
  onPickBaseline: (id: string | null) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onClearAll: () => void
  onFiles: (files: File[]) => void
  busy: boolean
}

function buildLists(
  current: Snapshot,
  baseline: Snapshot | null,
  analysis: Analysis,
  comparison: Comparison | null,
  trace: DepartureTrace | null,
  gone: Set<string>,
  now: number,
): Record<ListView, ListDef> {
  const since = baseline ? `‘${baseline.label}’` : '지난번'
  const timeline = trace ? buildTimeline(trace, now) : undefined
  const ready = trace !== null && trace.times.length >= 2

  // 사라진 사람을 이유별로 나눕니다.
  const left = ready ? trace.departures.filter((d) => d.reason !== 'blockedOrGone') : null
  // 사용자가 직접 확인해 '사라진 계정'으로 표시한 사람은 떠난 사람이 아닙니다.
  // 목록에서 지우지는 않습니다 — 지우면 잘못 눌렀을 때 되돌릴 방법이 없습니다.
  const goneIn = (list: Departure[] | null) =>
    list ? list.filter((d) => gone.has(d.user.username)).length : 0
  const maybeBlocked = ready ? trace.departures.filter((d) => d.reason === 'blockedOrGone') : null
  const renames = ready ? trace.renames : null
  const unsure = new Map(
    (left ?? []).filter((d) => d.reason === 'unknown').map((d) => [d.user.username, '구분 불가']),
  )
  const renamedTo = new Set((renames ?? []).map((r) => r.to.username))

  const timingNote = timeline
    ? ' 떠난 시점은 파일을 올린 두 시점 사이 구간으로만 알 수 있어서 어림값이에요.'
    : ''
  const myBlocksNote =
    trace && trace.blockedByMeCount > 0 ? ` 내가 차단한 ${num(trace.blockedByMeCount)}명은 뺐어요.` : ''
  const howToCheck =
    '확인하는 방법: 아이디를 눌러 프로필을 열어 보세요. 로그인한 상태에서는 안 보이는데 로그아웃한 브라우저에서는 보이면 차단입니다. 둘 다 안 보이면 상대가 계정을 비활성화했거나 지운 거예요.'

  return {
    unfollowers: {
      view: 'unfollowers',
      label: '나를 언팔한 사람',
      description:
        `${since} 스냅샷에서는 나를 팔로우했지만 지금은 팔로우하지 않는 계정이에요.${timingNote}${myBlocksNote}` +
        (goneIn(left) > 0 ? ` 사라진 계정으로 표시한 ${num(goneIn(left))}명은 빼고 셌어요.` : ''),
      icon: 'userMinus',
      tone: 'red',
      users: left ? left.map((d) => d.user) : null,
      count: left ? left.length - goneIn(left) : undefined,
      timeline,
      tags: unsure.size ? unsure : undefined,
      footnote:
        '대부분은 상대가 언팔한 거예요. 다만 상대가 계정을 비활성화하거나 지워도 똑같이 보이는데, ' +
        '파일에는 계정이 살아 있는지가 적혀 있지 않아 가려낼 수 없어요. ' +
        '아이디를 눌러 프로필이 안 열리면 아래 버튼으로 표시해 두세요. 다음부터 이 목록에서 빠져요.' +
        (unsure.size
          ? ' ‘구분 불가’ 표시는 내가 팔로우하지 않던 계정이라, 차단일 가능성까지 섞인 경우예요.'
          : ''),
      csv: 'unfollog-나를-언팔한-사람',
      emptyTitle: '나를 언팔한 사람이 없어요',
      emptyBody: '저장된 스냅샷 사이에 떠난 팔로워가 한 명도 없어요.',
    },
    'blocked': {
      view: 'blocked',
      label: '차단 의심 계정',
      description: `차단당하면 서로의 팔로우가 함께 끊어집니다. 아래 계정은 서로 팔로우하던 사이인데, 내가 끊지 않았는데도 내 팔로워와 팔로잉에서 동시에 사라졌어요. 상대가 계정을 비활성화하거나 지워도 같은 모습이라, 확인이 필요합니다.${timingNote}`,
      icon: 'ban',
      tone: 'red',
      users: maybeBlocked ? maybeBlocked.map((d) => d.user) : null,
      count: maybeBlocked ? maybeBlocked.length - goneIn(maybeBlocked) : undefined,
      timeline,
      footnote:
        trace && !trace.hasUnfollowLog
          ? `올린 파일에 ‘최근에 언팔한 계정’ 기록이 없어서, 내가 직접 언팔한 계정이 섞여 있을 수 있어요. ${howToCheck}`
          : howToCheck,
      csv: 'unfollog-차단-의심-계정',
      emptyTitle: '차단 의심 계정이 없어요',
      emptyBody: '서로 팔로우하다가 양쪽 목록에서 함께 사라진 계정이 없어요.',
    },
    renamed: {
      view: 'renamed',
      label: '아이디를 바꾼 사람',
      description:
        '옛 아이디가 사라지고 새 아이디가 생겼는데, 나를 팔로우한 시각이 초 단위까지 같은 계정이에요. 언팔이 아니라 아이디만 바꾼 것으로 보고 ‘나를 언팔한 사람’에서 뺐어요.',
      icon: 'pencil',
      tone: 'neutral',
      users: renames ? renames.map((r) => r.to) : null,
      notes: new Map((renames ?? []).map((r) => [r.to.username, `예전 아이디 @${r.from.display}`])),
      csv: 'unfollog-아이디를-바꾼-사람',
      emptyTitle: '아이디를 바꾼 사람이 없어요',
      emptyBody: '팔로우 시각이 같은 옛 아이디·새 아이디 쌍이 없어요.',
    },
    'new-followers': {
      view: 'new-followers',
      label: '새로 나를 팔로우한 사람',
      description: `${since} 스냅샷 이후에 새로 나를 팔로우한 계정이에요.`,
      icon: 'userPlus',
      tone: 'green',
      // 아이디만 바꾼 계정은 새 팔로워가 아닙니다.
      users: comparison ? comparison.newFollowers.filter((u) => !renamedTo.has(u.username)) : null,
      csv: 'unfollog-새로-나를-팔로우한-사람',
      emptyTitle: '새로 팔로우한 사람이 없어요',
      emptyBody: '두 스냅샷 사이에 새로 생긴 팔로워가 없어요.',
    },
    followers: {
      view: 'followers',
      short: '팔로워',
      label: '나를 팔로우하는 사람',
      description: '지금 나를 팔로우하고 있는 모든 계정이에요.',
      icon: 'users',
      tone: 'brand',
      users: current.followers,
      csv: 'unfollog-나를-팔로우하는-사람',
      emptyTitle: '나를 팔로우하는 사람이 없어요',
      emptyBody: '파일에 팔로워 목록이 들어 있지 않았어요. followers 파일도 함께 올려 주세요.',
    },
    following: {
      view: 'following',
      short: '팔로잉',
      label: '내가 팔로우하는 사람',
      description: '지금 내가 팔로우하고 있는 모든 계정이에요.',
      icon: 'userCheck',
      tone: 'brand',
      users: current.following,
      csv: 'unfollog-내가-팔로우하는-사람',
      emptyTitle: '내가 팔로우하는 사람이 없어요',
      emptyBody: '파일에 팔로잉 목록이 들어 있지 않았어요. following 파일도 함께 올려 주세요.',
    },
    mutual: {
      view: 'mutual',
      short: '맞팔',
      label: '서로 팔로우하는 사람',
      description: '나도 팔로우하고, 상대도 나를 팔로우하는 계정이에요.',
      icon: 'swap',
      tone: 'brand',
      users: analysis.mutual,
      csv: 'unfollog-서로-팔로우하는-사람',
      emptyTitle: '서로 팔로우하는 사람이 없어요',
      emptyBody: '팔로워와 팔로잉에 겹치는 계정이 없어요.',
    },
    'not-following-back': {
      view: 'not-following-back',
      label: '나를 맞팔하지 않는 사람',
      description: '내가 팔로우하고 있지만, 상대는 나를 팔로우하지 않는 계정이에요.',
      icon: 'userX',
      tone: 'neutral',
      users: analysis.notFollowingBack,
      csv: 'unfollog-나를-맞팔하지-않는-사람',
      emptyTitle: '모두 나를 맞팔하고 있어요',
      emptyBody: '내가 팔로우한 모든 계정이 나를 팔로우하고 있어요.',
    },
  }
}

function Workspace(props: WorkspaceProps) {
  const { view, back, current, baseline, analysis, comparison, metas } = props
  const lists = useMemo(
    () => buildLists(current, baseline, analysis, comparison, props.trace, props.gone, Date.now()),
    [current, baseline, analysis, comparison, props.trace, props.gone],
  )

  if (view === 'snapshots') {
    return (
      <Detail title="스냅샷 관리" onBack={back}>
        <p className="ko px-4 pb-4 text-[15px] leading-[1.65] text-muted sm:px-5">
          파일을 올릴 때마다 그때의 목록이 스냅샷으로 저장돼요. 기본은 가장 오래된 것부터 지금까지
          전체를 비교해요. <b className="font-semibold text-fg-2">여기서부터 비교</b>를 고르면 그
          시점 이후만 볼 수 있어요.
        </p>
        <SnapshotPanel
          metas={metas}
          currentId={current.id}
          baselineId={baseline?.id ?? null}
          persistent={props.persistent}
          onPickCurrent={props.onPickCurrent}
          onPickBaseline={props.onPickBaseline}
          onDelete={props.onDelete}
          onRename={props.onRename}
          onClearAll={props.onClearAll}
        />
      </Detail>
    )
  }

  if (view !== 'home' && view !== 'contact') {
    const def = lists[view]
    return (
      <Detail
        title={def.label}
        count={def.users ? (def.count ?? def.users.length) : undefined}
        description={def.users ? def.description : undefined}
        footnote={def.users?.length ? def.footnote : undefined}
        onBack={back}
      >
        {def.users ? (
          <UserList
            key={def.view}
            users={def.users}
            timeline={def.timeline}
            notes={def.notes}
            tags={def.tags}
            gone={
              view === 'unfollowers' || view === 'blocked'
                ? { set: props.gone, onToggle: props.onToggleGone }
                : undefined
            }
            csvName={def.csv}
            empty={<Empty icon="check" tone="green" title={def.emptyTitle} body={def.emptyBody} />}
          />
        ) : (
          <NeedsBaseline />
        )}
      </Detail>
    )
  }

  return <Home {...props} lists={lists} />
}

function Home({
  go,
  current,
  baseline,
  analysis,
  comparison,
  trace,
  metas,
  persistent,
  lists,
  onFiles,
  busy,
}: WorkspaceProps & { lists: Record<ListView, ListDef> }) {
  const unfollowed = lists.unfollowers.users?.length ?? null
  const maybeBlocked = lists['blocked'].users?.length ?? 0
  const oneWay = analysis.notFollowingBack.length
  // 스냅샷이 셋 이상이면 "지난번"이 아니라 실제 시작 날짜를 말해 줍니다.
  const since =
    trace && trace.times.length > 2 ? `${formatDay(trace.times[0])} 이후` : '지난번 이후'

  return (
    <div className="pt-4">
      {/* 한 문장으로 먼저 답합니다 */}
      <div className="px-1 pt-5 pb-7">
        <h1 className="display text-[28px] leading-[1.35] font-bold sm:text-[32px]" data-headline>
          {unfollowed === null ? (
            oneWay > 0 ? (
              <>
                내가 팔로우하는 사람 중
                <br />
                <span className="text-brand">{num(oneWay)}명</span>이 맞팔하지 않아요
              </>
            ) : (
              <>
                내가 팔로우하는 모든 사람이
                <br />
                나를 맞팔하고 있어요
              </>
            )
          ) : unfollowed > 0 ? (
            <>
              {since}
              <br />
              <span className="text-red">{num(unfollowed)}명</span>이 나를 언팔했어요
            </>
          ) : (
            <>
              {since}
              <br />
              나를 언팔한 사람이 없어요
            </>
          )}
        </h1>
        <p className="ko tnum mt-2.5 text-[15px] leading-[1.6] text-muted">
          {comparison && baseline ? (
            <>
              {formatRange(baseline.createdAt, current.createdAt)} · 팔로워{' '}
              {num(baseline.followers.length)}명 → {num(current.followers.length)}명
            </>
          ) : (
            <>{formatDay(current.createdAt)} 기준 · 나를 언팔한 사람은 파일을 한 번 더 올리면 알 수 있어요</>
          )}
        </p>
        {maybeBlocked > 0 && (
          <button
            onClick={() => go('blocked')}
            data-blocked-hint
            className="ko mt-3 inline-flex items-center gap-1 rounded-full bg-red-weak py-1.5 pr-2 pl-3 text-[14px] font-semibold text-red"
          >
            차단 의심 계정 {num(maybeBlocked)}명도 함께 확인하세요
            <Icon name="chevron" size={15} />
          </button>
        )}
      </div>

      <section>
        <h2 className="mb-2 px-1 text-[14px] font-semibold text-muted">지금 내 팔로우 관계</h2>
        <OneWayCard def={lists['not-following-back']} onOpen={go} />
        <StatRow defs={[lists.followers, lists.following, lists.mutual]} onOpen={go} />
        <WhyDifferent />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[14px] font-semibold text-muted">지난번과 달라진 것</h2>
        {comparison ? (
          <Card className="px-2 py-1">
            <ul>
              <MenuRow
                def={lists.unfollowers}
                onOpen={go}
                hint={lists.unfollowers.timeline ? '누가 언제 떠났는지까지 보여줘요' : undefined}
              />
              <MenuRow
                def={lists['blocked']}
                onOpen={go}
                hint="서로 팔로우하다 양쪽에서 동시에 사라졌어요"
              />
              <MenuRow def={lists['new-followers']} onOpen={go} last={!lists.renamed.users?.length} />
              {lists.renamed.users && lists.renamed.users.length > 0 && (
                <MenuRow def={lists.renamed} onOpen={go} hint="언팔이 아니라 아이디만 바뀌었어요" last />
              )}
            </ul>
          </Card>
        ) : (
          <FirstRecordCard />
        )}
      </section>

      <ReuploadCard onFiles={onFiles} busy={busy} hasComparison={!!comparison} />

      {CAN_CONTACT && (
        <Card className="mt-3 px-2 py-1">
          <button
            onClick={() => go('contact')}
            data-row="contact"
            className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-sunken"
          >
            <IconBadge icon="chat" tone="neutral" />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold">문의하기</span>
              <span className="ko mt-0.5 block text-[13px] text-muted">
                숫자가 이상하거나 안 되는 게 있으면 알려주세요
              </span>
            </span>
            <Icon name="chevron" size={18} className="text-line-strong" />
          </button>
        </Card>
      )}

      <Card className="mt-3 px-2 py-1">
        <button
          onClick={() => go('snapshots')}
          data-row="snapshots"
          className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-sunken"
        >
          <IconBadge icon="layers" tone="neutral" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold">스냅샷 관리</span>
            <span className="ko mt-0.5 block text-[13px] text-muted">
              {persistent ? '이 브라우저에만 저장돼요' : '창을 닫으면 사라져요'}
            </span>
          </span>
          <span className="tnum text-[16px] font-semibold text-muted">{num(metas.length)}개</span>
          <Icon name="chevron" size={18} className="text-line-strong" />
        </button>
      </Card>
    </div>
  )
}

/**
 * 내보내기 숫자가 인스타그램 화면과 다른 이유.
 * 평소에는 한 줄만 두고, 눌렀을 때 설명을 펼칩니다. 늘 펼쳐 두기엔
 * 길고, 작은 글씨로 깔아 두면 아무도 읽지 않습니다.
 */
function WhyDifferent() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        data-why-different
        aria-expanded={open}
        className="ko flex w-full items-center gap-1.5 px-1 text-left text-[13px] font-medium text-muted"
      >
        <Icon name="info" size={15} className="shrink-0" />
        <span className="flex-1">인스타 앱의 숫자와 다른가요?</span>
        <Icon
          name="chevron"
          size={15}
          className={cx('shrink-0 transition-transform', open ? 'rotate-90' : '')}
        />
      </button>
      {open && (
        <div className="ko mt-2 rounded-2xl bg-card p-4 text-[14px] leading-[1.7] text-muted shadow-card">
          <p>
            <b className="font-semibold text-fg-2">내보내기 파일이 더 많게 나와요.</b> 상대가 계정을
            비활성화하거나 지워도 파일에는 그대로 남거든요. 인스타 앱은 그런 계정을 빼고 세고요.
          </p>
          <p className="mt-2.5">
            파일에는 계정이 살아 있는지가 적혀 있지 않아서, 저희도 어느 계정인지 가려낼 수 없어요.
            그래서 <b className="font-semibold text-fg-2">언팔 목록에도 사라진 계정이 섞일 수
            있어요.</b>
          </p>
          <p className="mt-3.5 border-t border-line pt-3.5">
            <b className="font-semibold text-fg-2">반대로 훨씬 적게 나온다면</b> 내보낼 때
            기간이 ‘전체’가 아니었을 가능성이 커요. 기간을 좁히면 그 기간에 팔로우한 사람만
            파일에 담겨서, 800명이 500명처럼 나와요. 내보내기 화면에서{' '}
            <b className="font-semibold text-fg-2">기간 → 전체</b>를 고르고 다시 받아주세요.
          </p>
        </div>
      )}
    </div>
  )
}

/** 가장 강조하는 한 줄 — 내가 팔로우하지만 상대는 안 하는 계정 */
function OneWayCard({ def, onOpen }: { def: ListDef; onOpen: (v: View) => void }) {
  return (
    <Card>
      <button
        onClick={() => onOpen(def.view)}
        data-row={def.view}
        className="block w-full rounded-[20px] px-5 py-5 text-left transition-colors hover:bg-sunken"
      >
        {/* 좁은 화면에서 제목과 숫자가 한 줄에서 서로를 밀지 않도록 줄을 나눕니다. */}
        <span className="flex items-center gap-3.5">
          <IconBadge icon={def.icon} tone="brand" />
          <span className="ko min-w-0 flex-1 text-[16px] leading-[1.35] font-bold">{def.label}</span>
          <Icon name="chevron" size={18} className="shrink-0 text-line-strong" />
        </span>
        <span className="tnum display mt-3.5 block text-[32px] leading-none font-bold" data-count>
          {num(def.users?.length ?? 0)}명
        </span>
        <span className="ko mt-2 block text-[14px] leading-[1.45] text-muted">
          내가 팔로우하지만 상대는 안 해요
        </span>
      </button>
    </Card>
  )
}

/** 인스타그램 프로필처럼 숫자만 나란히 — 눌러서 목록으로 들어갑니다 */
function StatRow({ defs, onOpen }: { defs: ListDef[]; onOpen: (v: View) => void }) {
  return (
    <Card className="mt-3 flex p-1">
      {defs.map((def) => (
        <button
          key={def.view}
          onClick={() => onOpen(def.view)}
          data-row={def.view}
          className="min-w-0 flex-1 rounded-[17px] px-1 py-3.5 text-center transition-colors hover:bg-sunken"
        >
          <span className="tnum display block text-[21px] leading-tight font-bold" data-count>
            {num(def.users?.length ?? 0)}
          </span>
          <span className="mt-1 block truncate text-[13px] text-muted">{def.short}</span>
        </button>
      ))}
    </Card>
  )
}

/** 링크로 여는 미리보기에서는 파일 저장이 막혀 있어 알림 버튼을 숨깁니다. */
const CAN_DOWNLOAD = !import.meta.env.VITE_ARTIFACT

const REMIND_OPTIONS = [
  { days: 7, label: '1주 뒤' },
  { days: 14, label: '2주 뒤' },
  { days: 30, label: '한 달 뒤' },
]

/**
 * 스냅샷이 하나뿐일 때. 비교할 것이 없다는 사실을 설명하고,
 * 다음에 올릴 시점을 캘린더에 걸어 둘 수 있게 합니다.
 */
function FirstRecordCard() {
  const [booked, setBooked] = useState<number | null>(null)

  function remind(days: number) {
    const when = daysFromNow(days)
    // 캘린더 파일 이름은 영문으로 둡니다. 한글 이름을 못 다루는 캘린더 앱이 있습니다.
    const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
    download(
      `unfollog-reminder-${stamp}.ics`,
      buildReminderIcs(when, window.location.href),
      'text/calendar;charset=utf-8',
    )
    setBooked(days)
  }

  return (
    <Card className="p-5 sm:p-6" data-first-record>
      <div className="flex items-center gap-3.5">
        <IconBadge icon="clock" tone="brand" />
        <div className="min-w-0">
          <p className="ko text-[17px] leading-[1.35] font-bold">오늘이 첫 기록이에요</p>
          <p className="ko mt-1 text-[14px] leading-[1.5] text-muted">아직 비교할 대상이 없어요</p>
        </div>
      </div>

      <p className="ko mt-4 text-[15px] leading-[1.7] text-muted">
        인스타그램은 <b className="font-semibold text-fg-2">지금</b> 팔로워가 누구인지만 알려줘요.
        오늘 목록을 저장해 뒀으니, 다음에 한 번 더 올리면 그사이에{' '}
        <b className="font-semibold text-fg-2">누가 떠났는지, 누가 차단했는지</b> 알려드릴게요.
      </p>

      {CAN_DOWNLOAD && (
        <div className="mt-5 rounded-2xl bg-sunken p-4">
          <p className="ko text-[15px] font-semibold">잊지 않게 알림을 걸어둘까요?</p>
          <div className="mt-3 flex flex-wrap gap-2" data-remind>
            {REMIND_OPTIONS.map((o) => (
              <Button
                key={o.days}
                size="sm"
                variant={booked === o.days ? 'primary' : 'card'}
                onClick={() => remind(o.days)}
              >
                {booked === o.days ? <Icon name="check" size={15} /> : null}
                {o.label}
              </Button>
            ))}
          </div>
          <p className="ko mt-3 text-[13px] leading-[1.55] text-faint">
            {booked === null
              ? '휴대폰 캘린더에 일정으로 추가돼요. 전화번호를 받지 않아요.'
              : '내려받은 파일을 열면 캘린더에 들어가요. 그날 아침에 알림이 울려요.'}
          </p>
        </div>
      )}
    </Card>
  )
}

/**
 * 다시 올리는 자리.
 *
 * 비교할 스냅샷이 아직 없으면 "한 번 더 올려야 언팔을 알 수 있다" 는 사실이
 * 중요하고, 이미 있으면 "최신으로 갱신한다" 가 중요합니다. 기간을 잘못 골라
 * 받은 사람이 새로 받아 올리는 자리이기도 합니다.
 */
function ReuploadCard({
  onFiles,
  busy,
  hasComparison,
}: {
  onFiles: (files: File[]) => void
  busy: boolean
  hasComparison: boolean
}) {
  return (
    <Card className="mt-3 p-5" data-reupload-card>
      <div className="flex items-center gap-3.5">
        <IconBadge icon="upload" tone="brand" />
        <div className="min-w-0 flex-1">
          <p className="ko text-[16px] leading-[1.35] font-bold">
            {hasComparison ? '새 파일로 갱신하기' : '파일을 한 번 더 올리기'}
          </p>
          <p className="ko mt-0.5 text-[13px] leading-[1.5] text-muted">
            {hasComparison
              ? '내보내기를 새로 받았다면 올려주세요'
              : '내보내기를 새로 받으면 떠난 사람이 나와요'}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <Dropzone onFiles={onFiles} busy={busy} compact label="재업로드 하기" size="md" full />
      </div>
      <p className="ko mt-3 text-[13px] leading-[1.55] text-faint">
        숫자가 인스타 앱과 많이 다르면, 내보낼 때{' '}
        <b className="font-semibold text-muted">기간을 ‘전체’</b>로 고르고 다시 받아주세요.
      </p>
    </Card>
  )
}

function MenuRow({
  def,
  onOpen,
  hint,
  last,
}: {
  def: ListDef
  onOpen: (v: View) => void
  hint?: string
  last?: boolean
}) {
  const count = def.users ? (def.count ?? def.users.length) : null
  const countTone =
    count === null || count === 0
      ? 'text-faint'
      : def.tone === 'red'
        ? 'text-red'
        : def.tone === 'green'
          ? 'text-green'
          : 'text-fg'
  return (
    <li
      className={cx(
        'relative',
        !last && 'after:absolute after:right-3 after:bottom-0 after:left-[70px] after:h-px after:bg-line',
      )}
    >
      <button
        onClick={() => onOpen(def.view)}
        data-row={def.view}
        className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors hover:bg-sunken"
      >
        <IconBadge icon={def.icon} tone={def.tone} />
        <span className="min-w-0 flex-1">
          <span className="ko block text-[16px] leading-[1.4] font-bold">{def.label}</span>
          {(hint || count === null) && (
            <span className="ko mt-0.5 block text-[13px] leading-[1.45] text-muted">
              {count === null ? '파일을 한 번 더 올리면 볼 수 있어요' : hint}
            </span>
          )}
        </span>
        <span className={cx('tnum shrink-0 text-[17px] font-bold', countTone)} data-count>
          {count === null ? '—' : `${num(count)}명`}
        </span>
        <Icon name="chevron" size={18} className="text-line-strong" />
      </button>
    </li>
  )
}

function Detail({
  title,
  count,
  description,
  footnote,
  onBack,
  children,
}: {
  title: string
  count?: number
  description?: string
  footnote?: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="pt-2">
      <button
        onClick={onBack}
        data-back
        className="-ml-1 flex h-11 items-center gap-0.5 rounded-xl pr-3 pl-1 text-[15px] font-semibold text-muted transition-colors hover:text-fg"
      >
        <Icon name="chevron" size={20} className="rotate-180" />
        뒤로
      </button>

      <Card className="mt-1 overflow-hidden">
        <div className="px-4 pt-5 pb-4 sm:px-5">
          <h1 className="display text-[22px] leading-[1.4] font-bold" data-title>
            {title}
            {count !== undefined && (
              <span className="tnum ml-2 text-brand" data-total>
                {num(count)}명
              </span>
            )}
          </h1>
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
      </Card>
    </div>
  )
}

function NeedsBaseline() {
  return (
    <div className="px-6 pt-8 pb-14 text-center">
      <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-brand-weak text-brand">
        <Icon name="clock" size={28} />
      </span>
      <p className="display text-[19px] font-bold">아직 비교할 파일이 없어요</p>
      <p className="ko mx-auto mt-2.5 max-w-[380px] text-[15px] leading-[1.65] text-muted">
        인스타그램 내보내기에는 ‘지금’의 팔로워만 들어 있어서, 누가 떠났는지는 두 시점을 비교해야
        알 수 있어요. 1~2주 뒤에 한 번 더 받아서 올려주세요.
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

/** 집계 주소가 설정된 빌드에서만 방문 수를 셉니다. */
const COUNTS_VISITS = Boolean(import.meta.env.VITE_API_URL)

function Footer() {
  return (
    <footer className="gutter mx-auto w-full max-w-[680px] pb-12">
      <p className="ko text-[13px] leading-[1.7] text-faint">
        언팔로그는 인스타그램 공식 데이터 내보내기 파일만 사용해요. 계정 로그인 정보를 요구하지
        않아요. 팔로워 목록과 아이디는 브라우저 밖으로 나가지 않고, 저장된 스냅샷도 이
        브라우저에만 있어서 브라우저 데이터를 지우면 함께 사라져요.
        {CAN_CONTACT
          ? ' 문의할 때만, 그리고 직접 켜 두셨을 때만 팔로워 수 같은 숫자 요약이 함께 전달돼요.'
          : ''}
        {COUNTS_VISITS
          ? ' 얼마나 쓰이는지 보려고 방문 횟수만 익명으로 세요. 누구인지 알 수 있는 정보는 보내지 않아요.'
          : ''}
      </p>
      <p className="ko mt-2 text-[13px] text-faint">
        Instagram은 Meta Platforms, Inc.의 상표이며 이 프로젝트와 아무 관련이 없어요.
      </p>
      {CAN_CONTACT && (
        <a
          href="#contact"
          data-contact-link
          className="ko mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-muted"
        >
          문의하기
          <Icon name="chevron" size={14} />
        </a>
      )}
    </footer>
  )
}
