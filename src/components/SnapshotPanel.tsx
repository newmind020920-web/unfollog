import type { SnapshotMeta } from '../types'
import { Button, Icon, Pill, formatDate, cx } from './ui'

export function SnapshotPanel({
  metas,
  currentId,
  baselineId,
  onPickCurrent,
  onPickBaseline,
  onDelete,
  onRename,
  onClearAll,
}: {
  metas: SnapshotMeta[]
  currentId: string | null
  baselineId: string | null
  onPickCurrent: (id: string) => void
  onPickBaseline: (id: string | null) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onClearAll: () => void
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">저장된 스냅샷</h3>
          <p className="mt-1 text-[13px] text-muted">
            <b className="text-fg">최신</b> 과 <b className="text-fg">기준</b> 을 골라 비교합니다.
            언팔로워는 두 스냅샷의 차이에서 나옵니다.
          </p>
        </div>
        {metas.length > 0 && (
          <Button size="sm" variant="danger" onClick={onClearAll}>
            <Icon name="trash" size={14} />
            전체 삭제
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {metas.map((meta) => {
          const isCurrent = meta.id === currentId
          const isBaseline = meta.id === baselineId
          return (
            <li
              key={meta.id}
              className={cx(
                'rounded-xl border p-3.5 transition-colors',
                isCurrent
                  ? 'border-brand/45 bg-brand-soft/35'
                  : isBaseline
                    ? 'border-info/35 bg-info-soft/35'
                    : 'border-line bg-surface-2',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    const next = window.prompt('스냅샷 이름', meta.label)
                    if (next !== null && next.trim()) onRename(meta.id, next.trim())
                  }}
                  className="truncate text-sm font-medium text-fg hover:text-brand"
                  title="이름 바꾸기"
                >
                  {meta.label}
                </button>
                {isCurrent && <Pill tone="brand">최신</Pill>}
                {isBaseline && <Pill tone="info">기준</Pill>}
              </div>

              <p className="tnum mt-1.5 text-[12px] text-faint">
                {formatDate(meta.createdAt)} · 팔로워{' '}
                {meta.followerCount.toLocaleString('ko-KR')} · 팔로잉{' '}
                {meta.followingCount.toLocaleString('ko-KR')}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isCurrent}
                  onClick={() => onPickCurrent(meta.id)}
                >
                  최신으로
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isCurrent}
                  onClick={() => onPickBaseline(isBaseline ? null : meta.id)}
                >
                  {isBaseline ? '기준 해제' : '기준으로'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(meta.id)}>
                  <Icon name="trash" size={14} />
                  삭제
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {metas.length === 1 && (
        <p className="mt-4 flex gap-2.5 rounded-xl border border-info/25 bg-info-soft/50 p-3.5 text-[12px] leading-relaxed text-muted">
          <Icon name="clock" size={15} className="mt-px text-info" />
          <span>
            스냅샷이 하나라 아직 언팔로워를 계산할 수 없습니다. 1~2주 뒤에 내보내기를 한 번 더
            받아 올리면 그 사이에 떠난 사람이 정확히 나옵니다.
          </span>
        </p>
      )}
    </div>
  )
}
