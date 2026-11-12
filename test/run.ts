import { parseFiles } from '../src/lib/parse'
import { analyze, compare } from '../src/lib/analyze'
import type { Snapshot } from '../src/types'
import { buildZip, followersJson, followingJson, pendingJson } from './fixture'

let failures = 0
let checks = 0

function check(name: string, cond: boolean, detail?: unknown) {
  checks++
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
    if (detail !== undefined) console.log('       ', JSON.stringify(detail))
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  check(name, a === b, a === b ? undefined : { actual, expected })
}

const DIR = 'connections/followers_and_following/'

const BASE_FOLLOWERS: [string, number][] = [
  ['alice', 1700000000],
  ['bob', 1700001000],
  ['carol', 1700002000],
  ['dave', 1700003000],
]
const BASE_FOLLOWING: [string, number][] = [
  ['alice', 1699000000],
  ['bob', 1699001000],
  ['erin', 1699002000],
]

function zipFile(name: string, bytes: Uint8Array) {
  return new File([bytes], name, { type: 'application/zip' })
}

async function main() {
  console.log('\nZIP 내보내기 파싱')
  {
    const zip = buildZip([
      { name: DIR + 'followers_1.json', content: followersJson(BASE_FOLLOWERS) },
      { name: DIR + 'following.json', content: followingJson(BASE_FOLLOWING) },
      // 다른 관계 파일은 절대 섞여 들어가면 안 됩니다.
      { name: DIR + 'pending_follow_requests.json', content: pendingJson(['spammer']) },
      { name: DIR + 'recently_unfollowed_profiles.json', content: pendingJson(['oldfriend']) },
      { name: DIR + 'close_friends.json', content: pendingJson(['bestie']) },
      { name: DIR + 'blocked_profiles.json', content: pendingJson(['blockeduser']) },
      // 압축 안 한 엔트리(method 0)도 읽혀야 합니다.
      { name: 'personal_information/about_me.json', content: '{"ok":true}', store: true },
    ])
    const r = await parseFiles([zipFile('instagram-export.zip', zip)])
    eq('팔로워 4명', r.followers.map((u) => u.username), ['alice', 'bob', 'carol', 'dave'])
    eq('팔로잉 3명', r.following.map((u) => u.username), ['alice', 'bob', 'erin'])
    check('보류 중 요청/차단/친한친구 제외', !JSON.stringify(r).includes('spammer') &&
      !JSON.stringify(r).includes('bestie') && !JSON.stringify(r).includes('blockeduser') &&
      !JSON.stringify(r).includes('oldfriend'))
    eq('읽은 파일 2개', r.sources.length, 2)
    eq('경고 없음', r.warnings, [])
    eq('팔로우 시각 보존', r.followers[0].followedAt, 1700000000)
    eq('프로필 URL', r.followers[0].href, 'https://www.instagram.com/alice')
  }

  console.log('\n팔로워가 여러 파일로 쪼개진 경우')
  {
    const zip = buildZip([
      { name: DIR + 'followers_1.json', content: followersJson([['alice', 1], ['bob', 2]]) },
      { name: DIR + 'followers_2.json', content: followersJson([['carol', 3]]) },
      { name: DIR + 'followers_3.json', content: followersJson([['alice', 0], ['dave', 4]]) },
      { name: DIR + 'following.json', content: followingJson([['alice', 1]]) },
    ])
    const r = await parseFiles([zipFile('e.zip', zip)])
    eq('followers_1~3 합쳐짐', r.followers.map((u) => u.username), ['alice', 'bob', 'carol', 'dave'])
    eq('중복 제거됨', r.followers.length, 4)
  }

  console.log('\n개별 JSON 파일 업로드')
  {
    const r = await parseFiles([
      new File([followersJson(BASE_FOLLOWERS)], 'followers_1.json', { type: 'application/json' }),
      new File([followingJson(BASE_FOLLOWING)], 'following.json', { type: 'application/json' }),
    ])
    eq('팔로워 4명', r.followers.length, 4)
    eq('팔로잉 3명', r.following.length, 3)
  }

  console.log('\n관계 분석 (스냅샷 1개)')
  {
    const r = await parseFiles([
      new File([followersJson(BASE_FOLLOWERS)], 'followers_1.json'),
      new File([followingJson(BASE_FOLLOWING)], 'following.json'),
    ])
    const a = analyze({ id: 's1', createdAt: 1, label: 'A', ...r })
    eq('맞팔', a.mutual.map((u) => u.username), ['alice', 'bob'])
    eq('짝사랑 (내가 팔로우, 상대는 안 함)', a.notFollowingBack.map((u) => u.username), ['erin'])
    eq('팬 (상대가 팔로우, 내가 안 함)', a.fans.map((u) => u.username), ['carol', 'dave'])
    eq('팔로워 수', a.followerCount, 4)
    eq('팔로잉 수', a.followingCount, 3)
  }

  console.log('\n스냅샷 2개 비교 — 언팔로워 검출')
  {
    const prev: Snapshot = {
      id: 'p', createdAt: 1000, label: '지난주',
      ...(await parseFiles([
        new File([followersJson(BASE_FOLLOWERS)], 'followers_1.json'),
        new File([followingJson(BASE_FOLLOWING)], 'following.json'),
      ])),
    }
    const curr: Snapshot = {
      id: 'c', createdAt: 2000, label: '오늘',
      ...(await parseFiles([
        // bob, dave 가 떠나고 frank 가 새로 들어옴
        new File([followersJson([['alice', 1700000000], ['carol', 1700002000], ['frank', 1700500000]])], 'followers_1.json'),
        // erin 을 내가 언팔하고 grace 를 팔로우
        new File([followingJson([['alice', 1699000000], ['bob', 1699001000], ['grace', 1700600000]])], 'following.json'),
      ])),
    }
    const c = compare(prev, curr)
    eq('언팔로워', c.unfollowers.map((u) => u.username), ['bob', 'dave'])
    eq('새 팔로워', c.newFollowers.map((u) => u.username), ['frank'])
    eq('내가 언팔한 사람', c.removedFollowing.map((u) => u.username), ['erin'])
    eq('내가 새로 팔로우', c.addedFollowing.map((u) => u.username), ['grace'])
  }

  console.log('\n대소문자/비프로필 링크 처리')
  {
    const r = await parseFiles([
      new File([JSON.stringify([
        { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/MixedCase', value: 'MixedCase', timestamp: 5 }] },
        { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/mixedcase', value: 'mixedcase', timestamp: 9 }] },
        { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/p/Cabc123', value: '', timestamp: 7 }] },
      ])], 'followers_1.json'),
    ])
    eq('대소문자 무시하고 1명으로 합침', r.followers.length, 1)
    eq('표시용 이름은 원본 유지', r.followers[0].display, 'MixedCase')
    eq('이른 timestamp 유지', r.followers[0].followedAt, 5)
  }

  console.log('\n오류 처리')
  {
    const zip = buildZip([{ name: 'media/posts/1.jpg', content: 'not-json', store: true }])
    const r1 = await parseFiles([zipFile('photos-only.zip', zip)])
    check('팔로워 파일 없는 ZIP → 경고', r1.warnings.length === 1 && r1.followers.length === 0, r1.warnings)

    const r2 = await parseFiles([new File(['{ broken json'], 'followers_1.json')])
    check('깨진 JSON → 경고로 처리, 예외 아님', r2.warnings.length === 1, r2.warnings)

    const r3 = await parseFiles([new File(['x'], 'notes.txt')])
    check('지원하지 않는 확장자 → 경고', r3.warnings.length === 1, r3.warnings)

    const r4 = await parseFiles([new File([followersJson([['zoe', 1]])], 'mystery.json')])
    check('이름/내용 모두 불명 → 건너뛰고 경고', r4.warnings.length === 1 && r4.followers.length === 0, r4.warnings)

    const r5 = await parseFiles([
      new File([JSON.stringify({ relationships_following: JSON.parse(followingJson([['zoe', 1]])).relationships_following })], 'renamed.json'),
    ])
    eq('파일명이 바뀌어도 내용으로 following 판별', r5.following.map((u) => u.username), ['zoe'])
  }

  console.log(`\n${checks - failures}/${checks} 통과`)
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
