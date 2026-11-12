import type { IgUser, Snapshot } from '../types'

/** 한 스냅샷 안에서의 관계 분석 — 스냅샷이 하나만 있어도 바로 나옵니다. */
export type Analysis = {
  followerCount: number
  followingCount: number
  /** 서로 팔로우 */
  mutual: IgUser[]
  /** 내가 팔로우하는데 상대는 나를 팔로우하지 않음 */
  notFollowingBack: IgUser[]
  /** 상대는 나를 팔로우하는데 내가 팔로우하지 않음 */
  fans: IgUser[]
}

/** 두 스냅샷 비교 — 여기서만 "진짜 언팔로워"가 나옵니다. */
export type Comparison = {
  prevId: string
  currId: string
  prevAt: number
  currAt: number
  /** 이전엔 팔로워였지만 지금은 아님 = 언팔 (또는 탈퇴/차단/계정명 변경) */
  unfollowers: IgUser[]
  /** 새로 생긴 팔로워 */
  newFollowers: IgUser[]
  /** 내 팔로잉에서 사라진 사람 */
  removedFollowing: IgUser[]
  /** 내가 새로 팔로우한 사람 */
  addedFollowing: IgUser[]
}

function keySet(users: IgUser[]) {
  return new Set(users.map((u) => u.username))
}

export function analyze(snapshot: Snapshot): Analysis {
  const followerKeys = keySet(snapshot.followers)
  const followingKeys = keySet(snapshot.following)

  return {
    followerCount: snapshot.followers.length,
    followingCount: snapshot.following.length,
    mutual: snapshot.following.filter((u) => followerKeys.has(u.username)),
    notFollowingBack: snapshot.following.filter((u) => !followerKeys.has(u.username)),
    fans: snapshot.followers.filter((u) => !followingKeys.has(u.username)),
  }
}

export function compare(prev: Snapshot, curr: Snapshot): Comparison {
  const prevFollowers = keySet(prev.followers)
  const currFollowers = keySet(curr.followers)
  const prevFollowing = keySet(prev.following)
  const currFollowing = keySet(curr.following)

  return {
    prevId: prev.id,
    currId: curr.id,
    prevAt: prev.createdAt,
    currAt: curr.createdAt,
    unfollowers: prev.followers.filter((u) => !currFollowers.has(u.username)),
    newFollowers: curr.followers.filter((u) => !prevFollowers.has(u.username)),
    removedFollowing: prev.following.filter((u) => !currFollowing.has(u.username)),
    addedFollowing: curr.following.filter((u) => !prevFollowing.has(u.username)),
  }
}

/**
 * 사용자명을 바꾼 계정은 "언팔 1명 + 새 팔로워 1명"으로 보입니다.
 * 양쪽이 모두 있을 때 UI 에서 주의 문구를 띄우기 위한 판단입니다.
 */
export function mayContainRenames(c: Comparison) {
  return c.unfollowers.length > 0 && c.newFollowers.length > 0
}

/* ─────────────── 떠난 시점 추적 ───────────────
 *
 * 인스타그램은 "언제 언팔당했는지"를 기록해 주지 않습니다.
 * 저장해 둔 스냅샷을 오래된 것부터 훑으면, 어떤 사람이 마지막으로 팔로워였던
 * 시점과 사라진 것이 확인된 시점 사이로 구간을 좁힐 수 있습니다.
 *
 * 스냅샷을 통째로 배열에 모으면 큰 계정에서 메모리를 많이 쓰므로,
 * 하나씩 넣어 주는 방식으로 만들었습니다. 사용자명 1개당 항목 하나만 남습니다.
 */

export type Departure = {
  user: IgUser
  /** 마지막으로 팔로워인 것이 확인된 스냅샷 시각 */
  lastSeenAt: number
  /** 사라진 것이 처음 확인된 스냅샷 시각 */
  goneByAt: number
}

export type DepartureTrace = {
  /** 최근에 떠난 순 */
  departures: Departure[]
  /** 추적에 쓴 스냅샷 시각, 오래된 순 */
  times: number[]
  /** 서로 다른 이탈 구간의 수 — 2 이상이면 사람마다 시점이 다릅니다 */
  windowCount: number
}

export function departureTracker() {
  // 사용자명 → 마지막으로 팔로워였던 스냅샷의 정보
  const lastSeen = new Map<string, { user: IgUser; at: number; index: number }>()
  const times: number[] = []

  /** 스냅샷을 오래된 것부터 하나씩 넣습니다. */
  function add(snapshot: Snapshot) {
    const index = times.length
    times.push(snapshot.createdAt)
    for (const user of snapshot.followers) {
      // 나중 스냅샷의 정보로 덮어씁니다 — 표시 이름이 최신으로 유지됩니다.
      lastSeen.set(user.username, { user, at: snapshot.createdAt, index })
    }
  }

  function result(): DepartureTrace {
    const latest = times.length - 1
    const departures: Departure[] = []
    for (const entry of lastSeen.values()) {
      // 마지막 스냅샷에도 있으면 지금도 팔로워입니다.
      // (떠났다가 다시 돌아온 사람도 여기서 걸러집니다.)
      if (entry.index >= latest) continue
      departures.push({
        user: entry.user,
        lastSeenAt: entry.at,
        goneByAt: times[entry.index + 1],
      })
    }
    departures.sort(
      (a, b) => b.goneByAt - a.goneByAt || a.user.username.localeCompare(b.user.username),
    )
    return {
      departures,
      times,
      windowCount: new Set(departures.map((d) => d.goneByAt)).size,
    }
  }

  return { add, result }
}
