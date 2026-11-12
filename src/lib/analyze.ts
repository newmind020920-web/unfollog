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
