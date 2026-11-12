/** 인스타그램 내보내기에서 추출한 한 명의 사용자 */
export type IgUser = {
  /** 소문자로 정규화된 사용자명 (비교 키) */
  username: string
  /** 표시용 원본 사용자명 */
  display: string
  /** 프로필 URL */
  href: string
  /** 내보내기에 기록된 팔로우 시각 (unix seconds) */
  followedAt?: number
}

/** 한 시점의 팔로워/팔로잉 전체 스냅샷 */
export type Snapshot = {
  id: string
  /** 스냅샷을 저장한 시각 (ms) */
  createdAt: number
  label: string
  followers: IgUser[]
  following: IgUser[]
  /** 체험용 샘플 데이터인가 — 실제 업로드와 섞이지 않게 구분합니다 */
  sample?: boolean
}

/** IndexedDB에 저장할 때 목록을 뺀 요약 정보 */
export type SnapshotMeta = {
  id: string
  createdAt: number
  label: string
  followerCount: number
  followingCount: number
  sample?: boolean
}

export type ParseResult = {
  followers: IgUser[]
  following: IgUser[]
  /** 어떤 파일에서 무엇을 읽었는지 — UI에서 사용자에게 보여줄 근거 */
  sources: { file: string; kind: 'followers' | 'following'; count: number }[]
  /** 치명적이지 않은 문제 (예: 파일 하나를 못 읽음) */
  warnings: string[]
}
