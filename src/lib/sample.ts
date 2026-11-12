import type { IgUser, Snapshot } from '../types'

/**
 * 파일 없이 화면을 둘러볼 수 있는 체험용 데이터.
 * 실제 계정과 헷갈리지 않도록 아이디는 모두 demo_ 로 시작하고,
 * 프로필 링크는 만들지 않습니다.
 */

const WORDS = [
  'haneul', 'bada', 'dalbit', 'gureum', 'byeol', 'maru', 'sol', 'nabi', 'iseul', 'garam',
  'noeul', 'saebom', 'dasom', 'mirae', 'arum', 'boram', 'chorong', 'danbi', 'eunbit', 'hanbyeol',
]
const TAILS = ['', '_', '.log', '_daily', '.film', '_02', '_cafe', '.jpg', '__', '_room']

const DAY = 24 * 60 * 60

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

export function buildSampleSnapshots(now: number): [Snapshot, Snapshot] {
  const nowSec = Math.floor(now / 1000)
  const mutual = makeUsers(190, 0, nowSec) // 서로 팔로우
  const fans = makeUsers(110, 190, nowSec) // 나를 팔로우하지만 내가 안 함
  const oneWay = makeUsers(60, 300, nowSec) // 내가 팔로우하지만 상대가 안 함
  const newcomers = makeUsers(12, 360, nowSec).map((u, i) => ({
    ...u,
    followedAt: nowSec - (i % 6) * DAY - i * 1800,
  }))
  const newFollowing = makeUsers(3, 372, nowSec).map((u, i) => ({
    ...u,
    followedAt: nowSec - (i + 1) * DAY,
  }))

  const previous: Snapshot = {
    id: 'sample-previous',
    createdAt: now - 7 * DAY * 1000,
    label: '샘플 · 지난주',
    followers: [...mutual, ...fans],
    following: [...mutual, ...oneWay],
    sample: true,
  }

  // 일주일 사이: 맞팔 4명 + 팬 3명이 언팔, 12명이 새로 팔로우, 내가 3명을 새로 팔로우
  const current: Snapshot = {
    id: 'sample-current',
    createdAt: now,
    label: '샘플 · 오늘',
    followers: [...mutual.slice(4), ...fans.slice(3), ...newcomers],
    following: [...mutual, ...oneWay, ...newFollowing],
    sample: true,
  }

  return [previous, current]
}
