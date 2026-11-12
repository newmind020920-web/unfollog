import { Icon, InfoBox } from './ui'

const DYI_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/'

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '인스타그램에서 "내 정보 다운로드" 열기',
    body: (
      <>
        앱에서는 <b className="font-semibold text-fg-2">프로필 → ☰ → 설정 및 활동 → 내 정보 및 권한
        → 내 정보 다운로드</b> 순서예요. 웹에서는 아래 링크로 바로 갈 수 있어요.
        <a
          href={DYI_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2.5 flex w-fit items-center gap-1 font-semibold text-blue"
        >
          인스타그램에서 열기
          <Icon name="chevron" size={15} />
        </a>
      </>
    ),
  },
  {
    title: '"일부 정보 선택"에서 팔로워 및 팔로잉만 고르기',
    body: (
      <>
        전체를 요청하면 사진·동영상까지 들어가서 용량이 수 GB가 되고 준비도 오래 걸려요.
        <b className="font-semibold text-fg-2"> 팔로워 및 팔로잉</b> 하나만 고르면 보통 몇 분 안에
        받을 수 있어요.
      </>
    ),
  },
  {
    title: '형식은 JSON, 기간은 전체 기간',
    body: (
      <>
        HTML도 읽을 수 있지만 <b className="font-semibold text-fg-2">JSON</b>이 더 정확하고 팔로우
        날짜까지 들어 있어요. 기간을 좁히면 목록이 잘리니까 꼭{' '}
        <b className="font-semibold text-fg-2">전체 기간</b>으로 요청하세요.
      </>
    ),
  },
  {
    title: '받은 ZIP을 이 페이지에 올리기',
    body: (
      <>
        준비가 끝나면 인스타그램이 알림이나 이메일로 링크를 보내줘요. 내려받은 ZIP은 압축을 풀지
        않고 그대로 올리면 돼요.
      </>
    ),
  },
]

export function Guide() {
  return (
    <div>
      <ol className="space-y-6">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3.5">
            <span className="tnum mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue text-[14px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="ko text-[17px] leading-[1.45] font-bold">{step.title}</p>
              <p className="ko mt-1.5 text-[15px] leading-[1.65] text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7">
        <InfoBox>
          인스타그램 화면은 자주 바뀌어요. 메뉴 이름이 다르면 설정에서{' '}
          <b className="font-semibold">"내 정보 다운로드"</b> 또는{' '}
          <b className="font-semibold">"Download your information"</b>을 검색해 보세요.
        </InfoBox>
      </div>
    </div>
  )
}
