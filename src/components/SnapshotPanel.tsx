import type { SnapshotMeta } from '../types'
import { Button, Icon, InfoBox, Pill, cx, formatDate } from './ui'

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
    <div className="px-4 pb-5 sm:px-5">
      <p className="ko mb-4 text-[15px] leading-[1.65] text-muted">
        <b className="font-semibold text-fg-2">최신</b>과{' '}
        <b className="font-semibold text-fg-2">기준</b>을 골라서 비교해요. 언팔로워는 두 스냅샷의
        차이에서 나와요.
      </p>

      <ul className="space-y-2.5">
        {metas.map((meta) => {
          const isCurrent = meta.id === currentId
          const isBaseline = meta.id === baselineId
          return (
            <li
              key={meta.id}
              className={cx(
                'rounded-2xl p-4 transition-colors',
                isCurrent
                  ? 'bg-blue-weak'
                  : isBaseline
                    ? 'bg-sunken ring-1 ring-line-strong'
                    : 'bg-sunken',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[16px] font-bold">{meta.label}</p>
                {isCurrent && <Pill tone="blue">최신</Pill>}
                {isBaseline && <Pill tone="neutral">기준</Pill>}
                <button
                  onClick={() => {
                    const next = window.prompt('스냅샷 이름', meta.label)
                    if (next !== null && next.trim()) onRename(meta.id, next.trim())
                  }}
                  title="이름 바꾸기"
                  aria-label={`${meta.label} 이름 바꾸기`}
                  className="text-faint hover:text-fg-2"
                >
                  <Icon name="pencil" size={15} />
                </button>
              </div>

              <p className="tnum mt-1.5 text-[13px] text-faint">
                {formatDate(meta.createdAt)} · 팔로워 {meta.followerCount.toLocaleString('ko-KR')} ·
                팔로잉 {meta.followingCount.toLocaleString('ko-KR')}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={isCurrent} onClick={() => onPickCurrent(meta.id)}>
                  최신으로
                </Button>
                <Button
                  size="sm"
                  disabled={isCurrent}
                  onClick={() => onPickBaseline(isBaseline ? null : meta.id)}
                >
                  {isBaseline ? '기준 해제' : '기준으로'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(meta.id)}>
                  <Icon name="trash" size={15} />
                  삭제
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {metas.length === 1 && (
        <div className="mt-4">
          <InfoBox icon="clock" tone="blue">
            스냅샷이 하나라 아직 언팔로워를 계산할 수 없어요. 1~2주 뒤에 내보내기를 한 번 더 받아서
            올리면, 그 사이에 떠난 사람이 정확히 나와요.
          </InfoBox>
        </div>
      )}

      {metas.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <Button size="sm" variant="danger" onClick={onClearAll}>
            <Icon name="trash" size={15} />
            스냅샷 전체 삭제
          </Button>
        </div>
      )}
    </div>
  )
}
