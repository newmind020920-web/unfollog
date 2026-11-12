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

/* ─────────────── 누가, 언제, 왜 사라졌는지 ───────────────
 *
 * 인스타그램은 "누가 언제 나를 언팔했는지/차단했는지"를 기록해 주지 않습니다.
 * 저장해 둔 스냅샷을 오래된 것부터 훑어 두 가지를 추론합니다.
 *
 * 1) 언제 — 마지막으로 팔로워였던 시점과, 사라진 것이 확인된 시점 사이.
 *
 * 2) 왜 — 내 팔로잉 목록이 단서입니다.
 *    · 상대가 그냥 언팔하면: 내 팔로워에서만 빠지고, 내 팔로잉에는 그대로 남습니다.
 *    · 상대가 나를 차단하면: 양쪽 팔로우가 함께 끊겨, 내 팔로잉에서도 사라집니다.
 *      (계정을 비활성화·삭제해도 똑같이 보여서, 파일만으로는 둘을 구분할 수 없습니다.)
 *    · 아이디만 바꾸면: 옛 아이디가 사라지고 새 아이디가 생기지만,
 *      팔로우한 시각(초 단위)은 그대로입니다. 이 시각이 같고, 그 시각이 옛 아이디를
 *      마지막으로 본 때보다 앞서면 같은 계정으로 봅니다.
 *
 *    내가 직접 언팔·차단해서 끊긴 경우를 상대 탓으로 오해하지 않도록,
 *    내보내기에 들어 있는 "내가 언팔한 계정", "내가 차단한 계정" 기록을 대조합니다.
 *
 * 스냅샷을 통째로 배열에 모으면 큰 계정에서 메모리를 많이 쓰므로,
 * 하나씩 넣어 주는 방식으로 만들었습니다. 사용자명 1개당 항목 하나만 남습니다.
 */

export type DepartureReason =
  /** 내 팔로잉에는 그대로 있음 → 상대가 언팔한 것이 확실 */
  | 'unfollowed'
  /** 서로 팔로우했는데 내가 끊지 않았는데도 양쪽에서 사라짐 → 차단 또는 계정 사라짐 */
  | 'blockedOrGone'
  /** 내가 팔로우하지 않던 계정(또는 나도 언팔함) → 언팔인지 차단인지 구분 불가 */
  | 'unknown'

export type Departure = {
  user: IgUser
  /** 마지막으로 팔로워인 것이 확인된 스냅샷 시각 */
  lastSeenAt: number
  /** 사라진 것이 처음 확인된 스냅샷 시각 */
  goneByAt: number
  reason: DepartureReason
}

export type Rename = {
  from: IgUser
  to: IgUser
  /** 새 아이디가 처음 확인된 스냅샷 시각 */
  seenAt: number
}

export type DepartureTrace = {
  /** 최근에 떠난 순. 아이디를 바꾼 계정과 내가 차단한 계정은 빠져 있습니다 */
  departures: Departure[]
  /** 아이디만 바꾼 것으로 보이는 계정 */
  renames: Rename[]
  /** 내가 차단해서 사라진 계정 수 */
  blockedByMeCount: number
  /** 추적에 쓴 스냅샷 시각, 오래된 순 */
  times: number[]
  /** 서로 다른 이탈 구간의 수 — 2 이상이면 사람마다 시점이 다릅니다 */
  windowCount: number
  /** "내가 언팔한 계정" 기록이 있었는가 — 없으면 차단 추정의 확신이 낮아집니다 */
  hasUnfollowLog: boolean
}

type Seen = { user: IgUser; first: number; last: number }

export function departureTracker() {
  // 사용자명 → 팔로워로 처음/마지막 확인된 스냅샷 번호
  const followers = new Map<string, Seen>()
  // 사용자명 → 내가 팔로우한 것이 처음/마지막 확인된 스냅샷 번호
  const following = new Map<string, { first: number; last: number }>()
  const unfollowedByMe = new Set<string>()
  const blockedByMe = new Set<string>()
  const times: number[] = []
  let hasUnfollowLog = false

  /** 스냅샷을 오래된 것부터 하나씩 넣습니다. */
  function add(snapshot: Snapshot) {
    const index = times.length
    times.push(snapshot.createdAt)

    for (const user of snapshot.followers) {
      const seen = followers.get(user.username)
      // 나중 스냅샷의 정보로 덮어씁니다 — 표시 이름이 최신으로 유지됩니다.
      if (seen) {
        seen.user = user
        seen.last = index
      } else {
        followers.set(user.username, { user, first: index, last: index })
      }
    }
    for (const user of snapshot.following) {
      const seen = following.get(user.username)
      if (seen) seen.last = index
      else following.set(user.username, { first: index, last: index })
    }
    for (const user of snapshot.unfollowedByMe ?? []) unfollowedByMe.add(user.username)
    for (const user of snapshot.blockedByMe ?? []) blockedByMe.add(user.username)
    // 가장 최근 스냅샷에 기록이 있었는지가 중요합니다.
    hasUnfollowLog = snapshot.unfollowedByMe !== undefined
  }

  function result(): DepartureTrace {
    const latest = times.length - 1
    const gone: Seen[] = []
    const arrived: Seen[] = []
    for (const seen of followers.values()) {
      if (seen.last < latest) gone.push(seen)
      else if (seen.first > 0) arrived.push(seen)
    }

    // 아이디 변경 찾기: 사라진 계정과 새로 생긴 계정의 팔로우 시각이 초 단위로 같고,
    // 그 시각을 가진 계정이 양쪽에 하나씩뿐일 때만 같은 계정으로 봅니다.
    const byTime = (list: Seen[]) => {
      const map = new Map<number, Seen[]>()
      for (const seen of list) {
        const at = seen.user.followedAt
        if (at === undefined) continue
        const bucket = map.get(at)
        if (bucket) bucket.push(seen)
        else map.set(at, [seen])
      }
      return map
    }
    const goneByTime = byTime(gone)
    const arrivedByTime = byTime(arrived)
    const renamedFrom = new Map<string, Seen>()
    for (const [at, leavers] of goneByTime) {
      const newcomers = arrivedByTime.get(at)
      if (leavers.length !== 1 || newcomers?.length !== 1) continue
      const from = leavers[0]
      const to = newcomers[0]
      // 새 아이디는 옛 아이디가 사라진 뒤에 나타나야 하고,
      // 그 팔로우는 옛 아이디가 마지막으로 보인 때보다 먼저 일어난 것이어야 합니다.
      // (진짜 새 팔로워라면 팔로우 시각이 그 뒤일 테니, 우연히 겹친 경우가 걸러집니다.)
      const followedBeforeLastSeen = at * 1000 <= times[from.last]
      if (to.first > from.last && followedBeforeLastSeen) renamedFrom.set(from.user.username, to)
    }

    const departures: Departure[] = []
    const renames: Rename[] = []
    let blockedByMeCount = 0

    for (const seen of gone) {
      const name = seen.user.username

      const renamedTo = renamedFrom.get(name)
      if (renamedTo) {
        renames.push({ from: seen.user, to: renamedTo.user, seenAt: times[renamedTo.first] })
        continue
      }
      if (blockedByMe.has(name)) {
        blockedByMeCount++
        continue
      }

      const mine = following.get(name)
      const iFollowedThem = mine !== undefined && mine.first <= seen.last && mine.last >= seen.last
      const iStillFollow = mine !== undefined && mine.last === latest

      let reason: DepartureReason
      if (iFollowedThem && iStillFollow) reason = 'unfollowed'
      else if (iFollowedThem && !unfollowedByMe.has(name)) reason = 'blockedOrGone'
      else reason = 'unknown'

      departures.push({
        user: seen.user,
        lastSeenAt: times[seen.last],
        goneByAt: times[seen.last + 1],
        reason,
      })
    }

    departures.sort(
      (a, b) => b.goneByAt - a.goneByAt || a.user.username.localeCompare(b.user.username),
    )
    renames.sort((a, b) => b.seenAt - a.seenAt || a.to.username.localeCompare(b.to.username))

    return {
      departures,
      renames,
      blockedByMeCount,
      times,
      windowCount: new Set(departures.map((d) => d.goneByAt)).size,
      hasUnfollowLog,
    }
  }

  return { add, result }
}
