import type { IgUser, Snapshot } from '../types'

/**
 * 파일 없이 화면을 둘러볼 수 있는 체험용 데이터.
 * 실제 계정과 헷갈리지 않도록 아이디는 모두 demo_ 로 시작하고,
 * 프로필 링크는 만들지 않습니다.
 *
 * 떠난 시점 추적을 체험에서도 볼 수 있도록 스냅샷을 셋 만들고,
 * 언팔 · 차단 가능성 · 아이디 변경이 각각 보이도록 상황을 섞어 둡니다.
 */

const WORDS = [
  'haneul', 'bada', 'dalbit', 'gureum', 'byeol', 'maru', 'sol', 'nabi', 'iseul', 'garam',
  'noeul', 'saebom', 'dasom', 'mirae', 'arum', 'boram', 'chorong', 'danbi', 'eunbit', 'hanbyeol',
]
const TAILS = ['', '_', '.log', '_daily', '.film', '_02', '_cafe', '.jpg', '__', '_room']

const DAY = 24 * 60 * 60
const DAY_MS = DAY * 1000

function makeUsers(count: number, offset: number, nowSec: number): IgUser[] {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i
    const word = WORDS[n % WORDS.length]
    const tail = TAILS[Math.floor(n / WORDS.length) % TAILS.length]
    const display = `demo_${word}${tail}${Math.floor(n / (WORDS.length * TAILS.length)) || ''}`
    return {
      username: display.toLowerCase(),
      display,
      href: '',
      // 최근 2년에 걸쳐 고르게 흩어 놓습니다.
      followedAt: nowSec - ((n * 37) % 720) * DAY - (n % 24) * 3600,
    }
  })
}

/** 오래된 것부터 세 개 — 2주 전, 지난주, 오늘 */
export function buildSampleSnapshots(now: number): [Snapshot, Snapshot, Snapshot] {
  const nowSec = Math.floor(now / 1000)

  const mutual = makeUsers(190, 0, nowSec) // 서로 팔로우
  const fans = makeUsers(110, 190, nowSec) // 나를 팔로우하지만 내가 안 함
  const oneWay = makeUsers(60, 300, nowSec) // 내가 팔로우하지만 상대가 안 함

  // 중간에 들어온 사람들은 팔로우 날짜도 그 무렵으로 맞춥니다.
  const joinedWeek1 = makeUsers(5, 360, nowSec).map((u, i) => ({
    ...u,
    followedAt: nowSec - (10 + i) * DAY,
  }))
  const joinedWeek2 = makeUsers(12, 365, nowSec).map((u, i) => ({
    ...u,
    followedAt: nowSec - (i % 6) * DAY - i * 1800,
  }))
  const followedLater = makeUsers(3, 377, nowSec).map((u, i) => ({
    ...u,
    followedAt: nowSec - (i + 1) * DAY,
  }))

  // 마지막 주에 서로 팔로우하던 한 명이 양쪽 목록에서 함께 사라지고(차단 가능성),
  // 한 명은 아이디만 바꿉니다(팔로우 시각은 그대로).
  // (mutual[4] 가 사라지는 사람 — 아래 오늘 스냅샷의 양쪽 목록에서 모두 빠집니다)
  const renamedFrom = mutual[5]
  const renamedTo: IgUser = { ...renamedFrom, username: 'demo_newname.log', display: 'demo_newname.log' }
  const stayedMutual = mutual.slice(6)

  const twoWeeksAgo: Snapshot = {
    id: 'sample-0',
    createdAt: now - 17 * DAY_MS,
    label: '샘플 · 2주 전',
    followers: [...mutual, ...fans],
    following: [...mutual, ...oneWay],
    unfollowedByMe: [],
    sample: true,
  }

  // 1구간: 맞팔 2명 + 팬 1명이 떠나고, 5명이 새로 들어옴
  const lastWeek: Snapshot = {
    id: 'sample-1',
    createdAt: now - 7 * DAY_MS,
    label: '샘플 · 지난주',
    followers: [...mutual.slice(2), ...fans.slice(1), ...joinedWeek1],
    following: [...mutual, ...oneWay],
    unfollowedByMe: [],
    sample: true,
  }

  // 2구간: 맞팔 2명 + 팬 2명이 더 떠나고, 12명이 새로 들어옴
  const today: Snapshot = {
    id: 'sample-2',
    createdAt: now,
    label: '샘플 · 오늘',
    followers: [renamedTo, ...stayedMutual, ...fans.slice(3), ...joinedWeek1, ...joinedWeek2],
    following: [
      ...mutual.slice(0, 4), // 나를 언팔했지만 나는 아직 팔로우 중
      renamedTo,
      ...stayedMutual,
      ...oneWay,
      ...followedLater,
    ],
    unfollowedByMe: [],
    sample: true,
  }

  return [twoWeeksAgo, lastWeek, today]
}
