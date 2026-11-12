import { Icon } from './ui'

const DYI_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/'

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '인스타그램 "내 정보 다운로드" 열기',
    body: (
      <>
        앱에서는 <b>프로필 → ☰ → 설정 및 활동 → 내 정보 및 권한 → 내 정보 다운로드</b> 순서입니다.
        웹에서는 아래 링크로 바로 갈 수 있습니다.
        <a
          href={DYI_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-flex items-center gap-1.5 text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        >
          accountscenter.instagram.com 에서 열기
          <Icon name="external" size={13} />
        </a>
      </>
    ),
  },
  {
    title: '"일부 정보 선택" 에서 팔로워 및 팔로잉만 체크',
    body: (
      <>
        전체를 요청하면 사진·동영상까지 포함돼 용량이 수 GB가 되고 준비도 오래 걸립니다.
        <b> 팔로워 및 팔로잉</b> 하나만 고르면 보통 몇 분 안에 받을 수 있습니다.
      </>
    ),
  },
  {
    title: '형식은 JSON, 기간은 "전체 기간"',
    body: (
      <>
        HTML 도 읽을 수 있지만 <b>JSON</b> 이 더 정확하고 팔로우 날짜까지 들어 있습니다.
        기간을 좁히면 목록이 잘리므로 반드시 <b>전체 기간</b>으로 요청하세요.
      </>
    ),
  },
  {
    title: '받은 ZIP 을 이 페이지에 올리기',
    body: (
      <>
        준비가 끝나면 인스타그램이 알림·이메일로 다운로드 링크를 보냅니다. 내려받은 ZIP 을
        압축 풀지 않고 그대로 올리면 됩니다.
      </>
    ),
  },
]

export function Guide() {
  return (
    <div>
      <ol className="space-y-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="tnum mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/35 bg-brand-soft text-[13px] font-semibold text-brand">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 flex gap-2.5 rounded-xl border border-line bg-surface-2 p-3.5 text-[12px] leading-relaxed text-muted">
        <Icon name="alert" size={15} className="mt-px text-faint" />
        <span>
          인스타그램 화면은 자주 바뀝니다. 메뉴 이름이 다르면 설정에서 <b>"내 정보 다운로드"</b> 또는{' '}
          <b>"Download your information"</b> 을 검색해 보세요.
        </span>
      </p>
    </div>
  )
}
