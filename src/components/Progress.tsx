import { Icon, Spinner, cx } from './ui'

/** 분석이 지나가는 단계. 순서대로 진행합니다. */
export const STEPS = ['opening', 'followers', 'following', 'comparing', 'saving'] as const
export type Step = (typeof STEPS)[number]

export type Progress = { step: Step; followers: number; following: number }

const num = (n: number) => n.toLocaleString('ko-KR')

function label(step: Step, p: Progress, done: boolean): string {
  switch (step) {
    case 'opening':
      return done ? '파일 열기' : '파일 여는 중'
    case 'followers':
      return p.followers > 0 && done
        ? `팔로워 ${num(p.followers)}명 읽음`
        : done
          ? '팔로워 목록 읽기'
          : '팔로워 목록 읽는 중'
    case 'following':
      return p.following > 0 && done
        ? `팔로잉 ${num(p.following)}명 읽음`
        : done
          ? '팔로잉 목록 읽기'
          : '팔로잉 목록 읽는 중'
    case 'comparing':
      return done ? '두 목록 비교' : '두 목록 비교하는 중'
    case 'saving':
      return done ? '저장 완료' : '저장하는 중'
  }
}

export function AnalyzeProgress({ progress }: { progress: Progress }) {
  const current = STEPS.indexOf(progress.step)

  return (
    <div className="rounded-[20px] bg-card px-6 py-9 text-center shadow-card" data-progress>
      <div className="brand-mark mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] text-white">
        <Spinner className="h-7 w-7" />
      </div>

      <p className="display text-[19px] font-bold" data-progress-label>
        {label(progress.step, progress, false)}
      </p>
      <p className="ko mt-2 text-[14px] text-muted">파일은 네트워크로 전송되지 않아요</p>

      {/* 남은 단계가 몇 개인지 한눈에 */}
      <div className="mx-auto mt-6 flex max-w-[280px] gap-1.5" aria-hidden>
        {STEPS.map((step, i) => (
          <span
            key={step}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              i <= current ? 'bg-brand' : 'bg-line',
            )}
          />
        ))}
      </div>

      <ul className="mx-auto mt-6 max-w-[280px] space-y-2.5 text-left">
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          return (
            <li key={step} className="flex items-center gap-2.5">
              <span
                className={cx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  done ? 'bg-brand text-white' : active ? 'text-brand' : 'bg-sunken',
                )}
              >
                {done ? (
                  <Icon name="check" size={12} strokeWidth={3} />
                ) : active ? (
                  <Spinner className="h-4 w-4" />
                ) : null}
              </span>
              <span
                className={cx(
                  'ko tnum text-[14px]',
                  done ? 'font-medium text-fg-2' : active ? 'font-semibold text-fg' : 'text-faint',
                )}
              >
                {label(step, progress, !active)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
