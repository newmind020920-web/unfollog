import { chooseFiles, parseFiles, parseExportDate } from '../src/lib/parse'
import { analyze, compare, departureTracker } from '../src/lib/analyze'
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
    check('보류 중 요청/친한친구는 어디에도 없음', !JSON.stringify(r).includes('spammer') &&
      !JSON.stringify(r).includes('bestie'))
    const lists = JSON.stringify([r.followers, r.following])
    check('내 언팔·차단 기록이 팔로워/팔로잉에 섞이지 않음', !lists.includes('oldfriend') && !lists.includes('blockeduser'))
    eq('내가 언팔한 계정은 따로 보관', r.unfollowedByMe?.map((u) => u.username), ['oldfriend'])
    eq('내가 차단한 계정은 따로 보관', r.blockedByMe?.map((u) => u.username), ['blockeduser'])
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

  console.log('\n떠난 시점 추적 (스냅샷 3개 이상)')
  {
    const snap = (id: string, at: number, names: string[]): Snapshot => ({
      id,
      createdAt: at,
      label: id,
      followers: names.map((n) => ({ username: n, display: n, href: '' })),
      following: [],
    })

    const DAY = 86_400_000
    const t1 = 1_000 * DAY
    const t2 = t1 + 7 * DAY
    const t3 = t2 + 7 * DAY

    const tracker = departureTracker()
    //            alice bob carol dave erin frank
    // t1 (2주전)   O     O    O     O    -     -
    // t2 (1주전)   O     -    O     O    O     -     → bob 이 1구간에서 이탈
    // t3 (오늘)    O     -    -     O    O     O     → carol 이 2구간에서 이탈, dave 는 계속
    tracker.add(snap('t1', t1, ['alice', 'bob', 'carol', 'dave']))
    tracker.add(snap('t2', t2, ['alice', 'carol', 'dave', 'erin']))
    tracker.add(snap('t3', t3, ['alice', 'dave', 'erin', 'frank']))
    const trace = tracker.result()

    eq('떠난 사람 2명, 최근 순', trace.departures.map((d) => d.user.username), ['carol', 'bob'])
    eq('carol 은 t2~t3 구간', [trace.departures[0].lastSeenAt, trace.departures[0].goneByAt], [t2, t3])
    eq('bob 은 t1~t2 구간', [trace.departures[1].lastSeenAt, trace.departures[1].goneByAt], [t1, t2])
    eq('서로 다른 이탈 구간 2개', trace.windowCount, 2)
    eq('스냅샷 시각 3개', trace.times, [t1, t2, t3])
    check('계속 팔로워인 사람은 제외', !trace.departures.some((d) => ['alice', 'dave', 'erin', 'frank'].includes(d.user.username)))
  }

  console.log('\n떠났다가 돌아온 사람')
  {
    const snap = (at: number, names: string[]): Snapshot => ({
      id: String(at), createdAt: at, label: String(at),
      followers: names.map((n) => ({ username: n, display: n, href: '' })),
      following: [],
    })
    const tracker = departureTracker()
    tracker.add(snap(1, ['alice', 'bob']))
    tracker.add(snap(2, ['alice']))          // bob 이탈
    tracker.add(snap(3, ['alice', 'bob']))   // bob 복귀
    eq('돌아왔으면 떠난 사람이 아님', tracker.result().departures, [])

    const one = departureTracker()
    one.add(snap(1, ['alice', 'bob']))
    eq('스냅샷이 하나면 알 수 없음', one.result().departures, [])
    eq('구간 0개', one.result().windowCount, 0)
  }

  console.log('\n표시 이름은 마지막으로 보인 스냅샷 기준')
  {
    const tracker = departureTracker()
    tracker.add({
      id: 'a', createdAt: 1, label: 'a', following: [],
      followers: [{ username: 'zoe', display: 'Zoe_OLD', href: 'https://www.instagram.com/Zoe_OLD' }],
    })
    tracker.add({
      id: 'b', createdAt: 2, label: 'b', following: [],
      followers: [{ username: 'zoe', display: 'Zoe_NEW', href: 'https://www.instagram.com/Zoe_NEW' }],
    })
    tracker.add({ id: 'c', createdAt: 3, label: 'c', following: [], followers: [] })
    const d = tracker.result().departures[0]
    eq('최신 표시 이름 사용', d.user.display, 'Zoe_NEW')
    eq('구간은 b~c', [d.lastSeenAt, d.goneByAt], [2, 3])
  }

  console.log('\n왜 사라졌는지 가리기 (언팔 / 차단 가능성 / 구분 불가)')
  {
    const u = (n: string, at?: number) => ({ username: n, display: n, href: '', followedAt: at })
    const snap = (
      at: number,
      followers: string[],
      following: string[],
      extra: Partial<Snapshot> = {},
    ): Snapshot => ({
      id: String(at), createdAt: at, label: String(at),
      followers: followers.map((n) => u(n)),
      following: following.map((n) => u(n)),
      ...extra,
    })

    const tracker = departureTracker()
    // 지난번: 다섯 명이 나를 팔로우. 나는 그중 ann, ben, cat, dan 을 팔로우.
    tracker.add(snap(1, ['ann', 'ben', 'cat', 'dan', 'eve', 'fay'], ['ann', 'ben', 'cat', 'dan', 'fay']))
    // 지금: 다섯 명 모두 내 팔로워에서 사라짐.
    //  ann — 내 팔로잉에는 그대로            → 언팔 확실
    //  ben — 내 팔로잉에서도 사라짐, 내가 끊지 않음 → 차단 또는 계정 사라짐
    //  cat — 내 팔로잉에서도 사라짐, 내가 언팔함   → 구분 불가
    //  dan — 내가 차단함                      → 목록에서 제외
    //  eve — 내가 팔로우한 적 없음             → 구분 불가
    //  fay — 그대로 팔로워
    tracker.add(snap(2, ['fay'], ['ann', 'fay'], {
      unfollowedByMe: [u('cat')],
      blockedByMe: [u('dan')],
    }))
    const t = tracker.result()
    const reason = (n: string) => t.departures.find((d) => d.user.username === n)?.reason
    eq('ann: 내 팔로잉에 남아 있음 → 언팔', reason('ann'), 'unfollowed')
    eq('ben: 내가 끊지 않았는데 양쪽에서 사라짐 → 차단 가능성', reason('ben'), 'blockedOrGone')
    eq('cat: 내가 언팔한 기록 있음 → 구분 불가', reason('cat'), 'unknown')
    eq('eve: 내가 팔로우하지 않던 계정 → 구분 불가', reason('eve'), 'unknown')
    eq('dan: 내가 차단한 계정은 제외', reason('dan'), undefined)
    eq('내가 차단해서 빠진 수', t.blockedByMeCount, 1)
    eq('떠난 사람 4명', t.departures.length, 4)
    eq('언팔 기록 파일이 있었음', t.hasUnfollowLog, true)

    const noLog = departureTracker()
    noLog.add(snap(1, ['ben'], ['ben']))
    noLog.add(snap(2, [], []))
    eq('언팔 기록 파일이 없으면 표시', noLog.result().hasUnfollowLog, false)
    eq('기록이 없어도 차단 가능성으로 분류', noLog.result().departures[0].reason, 'blockedOrGone')
  }

  console.log('\n아이디 변경 찾기 (팔로우 시각이 같음)')
  {
    const u = (n: string, at?: number) => ({ username: n, display: n, href: '', followedAt: at })
    const snap = (at: number, followers: ReturnType<typeof u>[], following: ReturnType<typeof u>[]): Snapshot => ({
      id: String(at), createdAt: at, label: String(at), followers, following,
    })
    // 스냅샷 시각은 ms, 팔로우 시각은 초. T1 에 첫 스냅샷, 일주일 뒤 T2.
    const T1 = 1_700_000_000_000
    const T2 = T1 + 7 * 86_400_000
    const OLD = 1_650_000_000 // 첫 스냅샷보다 훨씬 전에 한 팔로우
    const RECENT = T1 / 1000 + 3600 // 첫 스냅샷 한 시간 뒤에 한 팔로우

    const tracker = departureTracker()
    tracker.add(snap(T1, [u('old_name', OLD), u('leaver', OLD + 1), u('stay', OLD + 2)], [u('old_name', 900)]))
    // old_name → new_name (팔로우 시각 그대로). leaver 는 진짜로 떠남. brand_new 는 새 팔로워.
    tracker.add(snap(T2, [u('new_name', OLD), u('stay', OLD + 2), u('brand_new', RECENT)], [u('new_name', 900)]))
    const t = tracker.result()
    eq('아이디 변경 1건', t.renames.map((r) => [r.from.username, r.to.username]), [['old_name', 'new_name']])
    eq('아이디 바꾼 계정은 떠난 사람에서 제외', t.departures.map((d) => d.user.username), ['leaver'])

    // 같은 초에 팔로우한 계정이 여럿이면 누가 누구인지 알 수 없으므로 짝짓지 않습니다.
    const ambiguous = departureTracker()
    ambiguous.add(snap(T1, [u('a1', OLD), u('a2', OLD)], []))
    ambiguous.add(snap(T2, [u('b1', OLD)], []))
    eq('시각이 겹치면 짝짓지 않음', ambiguous.result().renames, [])
    eq('그 경우 둘 다 떠난 사람으로 남김', ambiguous.result().departures.length, 2)

    // 떠난 뒤가 아니라 원래부터 있던 계정과는 짝짓지 않습니다.
    const coexist = departureTracker()
    coexist.add(snap(T1, [u('x', OLD), u('y', OLD)], []))
    coexist.add(snap(T2, [u('y', OLD)], []))
    eq('원래 있던 계정과는 짝짓지 않음', coexist.result().renames, [])

    // 떠난 사람과 진짜 새 팔로워의 시각이 우연히 같아도, 그 팔로우가 지난 스냅샷 뒤에
    // 일어난 것이면 새 팔로워입니다.
    const coincidence = departureTracker()
    coincidence.add(snap(T1, [u('gone', RECENT)], []))
    coincidence.add(snap(T2, [u('fresh', RECENT)], []))
    eq('지난 스냅샷 뒤의 팔로우는 아이디 변경이 아님', coincidence.result().renames, [])
    eq('떠난 사람으로 남김', coincidence.result().departures.map((d) => d.user.username), ['gone'])
  }

  console.log('\n최근 내보내기 형식 (아이디가 title 에, 주소는 /_u/)')
  {
    const r = await parseFiles([
      new File([JSON.stringify({ relationships_following: [
        { title: 'New.Format', string_list_data: [{ href: 'https://www.instagram.com/_u/New.Format', timestamp: 1700000000 }] },
        { title: 'TitleOnly', string_list_data: [{ timestamp: 1700000001 }] },
      ] })], 'following.json'),
    ])
    eq('title 과 /_u/ 주소에서 아이디를 읽음', r.following.map((u) => u.username), ['new.format', 'titleonly'])
    eq('팔로우 시각 유지', r.following[0].followedAt, 1700000000)
  }

  console.log('\nHTML 내보내기의 날짜 글자 읽기')
  {
    const at = parseExportDate('11월 10, 2026 8:31 오후')
    const d = at !== undefined ? new Date(at * 1000) : undefined
    eq('한국어 오후', d && [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()],
       [2026, 11, 10, 20, 31])
    const am = parseExportDate('1월 3, 2025 12:05 오전')
    const dam = am !== undefined ? new Date(am * 1000) : undefined
    eq('한국어 오전 12시는 0시', dam && [dam.getMonth() + 1, dam.getDate(), dam.getHours()], [1, 3, 0])
    const noon = parseExportDate('6월 7, 2024 12:00 오후')
    const dn = noon !== undefined ? new Date(noon * 1000) : undefined
    eq('한국어 오후 12시는 12시', dn && dn.getHours(), 12)
    check('영어 표기도 읽음', parseExportDate('Nov 10, 2026 8:31 PM') !== undefined)
    eq('날짜가 아니면 undefined', parseExportDate('팔로워 및 팔로잉'), undefined)
    eq('빈 글자도 undefined', parseExportDate('  '), undefined)
  }

  console.log('\nvalue 에 주소 전체가 들어 있는 내보내기')
  {
    // 같은 사람을 한쪽은 아이디로, 한쪽은 주소로 적는 내보내기가 있습니다.
    // 주소에서 아이디를 뽑지 않으면 두 목록이 하나도 안 겹칩니다.
    const r = await parseFiles([
      new File([JSON.stringify([
        { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/same_person', value: 'same_person', timestamp: 10 }] },
      ])], 'followers_1.json'),
      new File([JSON.stringify({ relationships_following: [
        { title: '', media_list_data: [], string_list_data: [{ href: 'https://www.instagram.com/_u/same_person', value: 'https://www.instagram.com/_u/same_person', timestamp: 10 }] },
      ] })], 'following.json'),
    ])
    eq('팔로워 아이디', r.followers.map((u) => u.username), ['same_person'])
    eq('팔로잉도 같은 아이디로 읽힘', r.following.map((u) => u.username), ['same_person'])
    const a = analyze({ id: 's', createdAt: 1, label: 'l', ...r })
    eq('맞팔로 잡힘', a.mutual.map((u) => u.username), ['same_person'])
    eq('짝사랑 없음', a.notFollowingBack.length, 0)
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

  console.log('\n내보내기 기간 감지')
  {
    const DAY = 86_400
    const now = Math.floor(Date.UTC(2026, 10, 14) / 1000)
    const span = (count: number, oldestDaysAgo: number) =>
      Array.from({ length: count }, (_, i): [string, number] => [
        `u${i}`,
        now - Math.round((oldestDaysAgo * i) / Math.max(count - 1, 1)) * DAY,
      ])

    // 기간을 "전체" 로 내보낸 경우: 몇 년 치가 담깁니다.
    const wide = await parseFiles([new File([followersJson(span(60, 1500))], 'followers_1.json')])
    check('기간이 넓으면 경고 없음', wide.coverage?.likelyNarrowed === false, wide.coverage)

    // 기간을 좁혀 내보낸 경우: 최근 90일만 담겨 숫자가 적게 나옵니다.
    const narrow = await parseFiles([new File([followersJson(span(60, 90))], 'followers_1.json')])
    check('기간이 좁으면 경고', narrow.coverage?.likelyNarrowed === true, narrow.coverage)

    // 사람이 몇 명 없으면 기간이 짧은 게 당연하므로 경고하지 않습니다.
    const few = await parseFiles([new File([followersJson(span(5, 10))], 'followers_1.json')])
    check('사람이 적으면 경고 안 함', few.coverage?.likelyNarrowed === false, few.coverage)
  }

  console.log('\nJSON 과 HTML 이 섞인 ZIP')
  {
    // blocked_profiles.json 하나 때문에 followers HTML 이 통째로 버려지면 안 됩니다.
    eq(
      'JSON 이 섞여도 HTML 팔로워를 읽음',
      chooseFiles(['followers_1.html', 'following.html', 'blocked_profiles.json']),
      ['followers_1.html', 'following.html', 'blocked_profiles.json'],
    )
    // 같은 종류가 둘 다 있으면 JSON 만 씁니다.
    eq(
      '같은 종류는 JSON 우선',
      chooseFiles(['followers_1.html', 'followers_1.json', 'following.html']),
      ['followers_1.json', 'following.html'],
    )
    // 쪼개진 HTML 은 전부 읽습니다.
    eq(
      '쪼개진 HTML 은 전부 읽음',
      chooseFiles(['followers_1.html', 'followers_2.html']),
      ['followers_1.html', 'followers_2.html'],
    )
  }

  console.log(`\n${checks - failures}/${checks} 통과`)
  if (failures) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
