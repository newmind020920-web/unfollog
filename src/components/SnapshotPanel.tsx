import { useState } from 'react'
import type { SnapshotMeta } from '../types'
import { Button, Icon, InfoBox, Pill, cx, formatDate } from './ui'

/**
 * 스냅샷 목록. 삭제와 이름 바꾸기는 브라우저 대화상자(confirm/prompt) 대신
 * 카드 안에서 바로 확인합니다 — 대화상자가 막힌 환경에서도 동작하고 흐름이 끊기지 않습니다.
 */
export function SnapshotPanel({
  metas,
  currentId,
  baselineId,
  persistent,
  onPickCurrent,
  onPickBaseline,
  onDelete,
  onRename,
  onClearAll,
}: {
  metas: SnapshotMeta[]
  currentId: string | null
  baselineId: string | null
  persistent: boolean
  onPickCurrent: (id: string) => void
  onPickBaseline: (id: string | null) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onClearAll: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  function saveRename(id: string) {
    const next = draft.trim()
    if (next) onRename(id, next)
    setEditingId(null)
  }

  return (
    <div className="px-4 pb-5 sm:px-5">
      {!persistent && (
        <div className="mb-4">
          <InfoBox>
            이 브라우저에서는 저장이 막혀 있어서, 창을 닫으면 스냅샷이 사라져요. 시크릿 창이 아닌
            일반 창에서 열면 계속 남아 있어요.
          </InfoBox>
        </div>
      )}

      <ul className="space-y-2.5">
        {metas.map((meta) => {
          const isCurrent = meta.id === currentId
          const isBaseline = meta.id === baselineId
          const isEditing = meta.id === editingId
          const isDeleting = meta.id === deletingId
          return (
            <li
              key={meta.id}
              data-snapshot={meta.id}
              className={cx(
                'rounded-2xl p-4 transition-colors',
                isCurrent ? 'bg-blue-weak' : 'bg-sunken',
                isBaseline && 'ring-1 ring-line-strong',
              )}
            >
              {isEditing ? (
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveRename(meta.id)
                  }}
                >
                  <input
                    id={`rename-${meta.id}`}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    aria-label="스냅샷 이름"
                    className="h-10 min-w-0 flex-1 rounded-[10px] bg-card px-3 text-[15px] font-semibold text-fg"
                  />
                  <Button size="sm" variant="primary" onClick={() => saveRename(meta.id)}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    취소
                  </Button>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[16px] font-bold">{meta.label}</p>
                  {isCurrent && <Pill tone="blue">지금 보는 것</Pill>}
                  {isBaseline && <Pill tone="neutral">비교 기준</Pill>}
                  <button
                    onClick={() => {
                      setDraft(meta.label)
                      setEditingId(meta.id)
                    }}
                    title="이름 바꾸기"
                    aria-label={`${meta.label} 이름 바꾸기`}
                    className="p-1 text-faint hover:text-fg-2"
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                </div>
              )}

              <p className="tnum mt-1.5 text-[13px] text-faint">
                {formatDate(meta.createdAt)} · 팔로워 {meta.followerCount.toLocaleString('ko-KR')}명 ·
                팔로잉 {meta.followingCount.toLocaleString('ko-KR')}명
              </p>

              {isDeleting ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="ko mr-1 text-[14px] font-medium text-fg-2">
                    이 스냅샷을 삭제할까요?
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setDeletingId(null)
                      onDelete(meta.id)
                    }}
                  >
                    삭제
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>
                    취소
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!isCurrent && (
                    <Button size="sm" variant="card" onClick={() => onPickCurrent(meta.id)}>
                      이걸로 보기
                    </Button>
                  )}
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="card"
                      onClick={() => onPickBaseline(isBaseline ? null : meta.id)}
                    >
                      {isBaseline ? '비교 기준 해제' : '비교 기준으로'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDeletingId(meta.id)}>
                    <Icon name="trash" size={15} />
                    삭제
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {metas.length === 1 && (
        <div className="mt-4">
          <InfoBox icon="clock" tone="blue">
            스냅샷이 하나라 아직 나를 언팔한 사람을 알 수 없어요. 1~2주 뒤에 내보내기를 한 번 더
            받아서 올리면, 그 사이에 떠난 사람이 정확히 나와요.
          </InfoBox>
        </div>
      )}

      {metas.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          {clearing ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="ko mr-1 text-[14px] font-medium text-fg-2">
                스냅샷을 모두 삭제할까요? 되돌릴 수 없어요.
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setClearing(false)
                  onClearAll()
                }}
              >
                모두 삭제
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClearing(false)}>
                취소
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="danger" onClick={() => setClearing(true)}>
              <Icon name="trash" size={15} />
              스냅샷 전체 삭제
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
