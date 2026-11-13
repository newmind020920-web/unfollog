import { Icon, InfoBox } from './ui'

const DYI_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/'

/** 화면에 보이는 버튼 이름 그대로 — 누를 곳을 눈에 띄게 표시합니다. */
function Tap({ children }: { children: React.ReactNode }) {
  return (
    <b className="rounded-md bg-sunken px-1.5 py-0.5 text-[14px] font-semibold text-fg-2">
      {children}
    </b>
  )
}

/** 칩 사이를 잇는 화살표 */
function Arrow() {
  return <span className="text-[13px] text-faint">→</span>
}

const STEPS: { title: React.ReactNode; body: React.ReactNode }[] = [
  {
    title: <Tap>내 정보 내보내기</Tap>,
    body: (
      <>
        앱에서는 프로필 → ☰ → 설정 및 활동 → 내 정보 및 권한 → 내 정보 내보내기 순서예요.
        <a
          href={DYI_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2.5 flex w-fit items-center gap-1 font-semibold text-brand"
        >
          인스타그램에서 바로 열기
          <Icon name="chevron" size={15} />
        </a>
      </>
    ),
  },
  {
    title: (
      <>
        <Tap>내보내기 만들기</Tap> <Arrow /> <Tap>기기로 내보내기</Tap>
      </>
    ),
    body: <>이메일로 받지 않고 이 기기에 바로 내려받는 방식이에요.</>,
  },
  {
    title: (
      <>
        <Tap>정보 맞춤 설정</Tap> <Arrow /> <Tap>모두 지우기</Tap> <Arrow />{' '}
        <Tap>팔로워 및 팔로잉</Tap>
      </>
    ),
    body: (
      <>
        모두 지운 뒤 <b className="font-semibold text-fg-2">팔로워 및 팔로잉</b> 하나만
        체크하세요. 전체를 그대로 두면 사진·동영상까지 들어가서 용량이 수 GB가 되고 준비도 며칠
        걸려요.
      </>
    ),
  },
  {
    title: (
      <>
        <Tap>뒤로가기</Tap> <Arrow /> <Tap>기간</Tap> <Arrow /> <Tap>전체</Tap>
      </>
    ),
    body: (
      <>
        기간을 좁히면 목록이 잘려요. 같은 화면에{' '}
        <b className="font-semibold text-fg-2">형식</b>이 있으면{' '}
        <b className="font-semibold text-fg-2">JSON</b>으로 두세요. 팔로우한 날짜가 들어 있어서 더
        정확하게 분석할 수 있어요.
      </>
    ),
  },
  {
    title: (
      <>
        <Tap>내보내기 시작</Tap>
      </>
    ),
    body: (
      <>
        준비가 끝나면 인스타그램이 알림으로 알려줘요. 보통 몇 분 안에 끝나요. 내려받은 ZIP은 압축을
        풀지 않고 그대로 올리면 돼요.
      </>
    ),
  },
]

export function Guide() {
  return (
    <div>
      <ol className="space-y-6">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="tnum mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[14px] font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="ko text-[17px] leading-[1.5] font-bold">{step.title}</p>
              <p className="ko mt-1.5 text-[15px] leading-[1.65] text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-7">
        <InfoBox>
          인스타그램 화면은 자주 바뀌어요. 메뉴 이름이 다르면 설정에서{' '}
          <b className="font-semibold">"내 정보 내보내기"</b> 또는{' '}
          <b className="font-semibold">"Download your information"</b>을 검색해 보세요.
        </InfoBox>
      </div>
    </div>
  )
}
