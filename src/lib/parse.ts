import type { IgUser, ParseResult } from '../types'
import { readZipIndex, readZipEntryText, ZipError, type ZipEntry } from './zip'

/**
 * 인스타그램 "내 정보 내보내기" 결과를 파싱합니다.
 *
 * 받는 형태:
 *  - 내보내기 ZIP 통째로
 *  - connections/followers_and_following/ 안의 followers_*.json / following.json
 *  - 같은 폴더의 HTML 버전
 *
 * 팔로워·팔로잉 외에 두 파일을 더 읽습니다. 화면에 목록으로 보여주려는 것이 아니라,
 * 누군가 사라졌을 때 "상대가 끊은 것인지, 내가 끊은 것인지"를 가리는 근거로만 씁니다.
 *  - recently_unfollowed_profiles.json : 내가 최근에 언팔한 계정
 *  - blocked_profiles.json             : 내가 차단한 계정
 */

/** 팔로워 목록 파일인가 (다른 관계 파일은 전부 제외) */
const FOLLOWERS_FILE = /^followers(?:[_-]?\d+)?\.(json|html?)$/i
/** 팔로잉 목록 파일인가 */
const FOLLOWING_FILE = /^following(?:[_-]?\d+)?\.(json|html?)$/i
/** 내가 최근에 언팔한 계정 */
const MY_UNFOLLOWS_FILE = /^recently_unfollowed_(?:profiles|accounts)\.(json|html?)$/i
/** 내가 차단한 계정 */
const MY_BLOCKS_FILE = /^blocked_(?:profiles|accounts)\.(json|html?)$/i

function basename(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

export type FileKind = 'followers' | 'following' | 'unfollowedByMe' | 'blockedByMe' | null

export function classifyFileName(path: string): FileKind {
  const name = basename(path)
  if (FOLLOWERS_FILE.test(name)) return 'followers'
  if (FOLLOWING_FILE.test(name)) return 'following'
  if (MY_UNFOLLOWS_FILE.test(name)) return 'unfollowedByMe'
  if (MY_BLOCKS_FILE.test(name)) return 'blockedByMe'
  return null
}

function usernameFromHref(href: string): string | null {
  try {
    const url = new URL(href)
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null
    const seg = url.pathname.split('/').filter(Boolean)
    // 최근 내보내기는 프로필 주소를 /_u/<아이디> 로 적기도 합니다.
    if (seg.length === 2 && seg[0] === '_u') return decodeURIComponent(seg[1])
    if (seg.length !== 1) return null // /p/..., /explore/..., /stories/... 는 프로필이 아님
    return decodeURIComponent(seg[0])
  } catch {
    return null
  }
}

/** 프로필이 아닌 인스타그램 경로 */
const NON_PROFILE = new Set([
  'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'direct',
  'accounts', 'about', 'legal', 'developer', 'challenge',
])

function pushUser(out: Map<string, IgUser>, rawName: string, href: string, timestamp?: unknown) {
  const display = rawName.trim()
  if (!display) return
  const username = display.toLowerCase()
  if (NON_PROFILE.has(username)) return

  const followedAt =
    typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
      ? timestamp
      : undefined

  const existing = out.get(username)
  if (existing) {
    // 같은 사용자가 여러 파일에 나오면 더 이른 팔로우 시각을 남깁니다.
    if (followedAt && (!existing.followedAt || followedAt < existing.followedAt)) {
      existing.followedAt = followedAt
    }
    return
  }
  out.set(username, {
    username,
    display,
    href: href || `https://www.instagram.com/${encodeURIComponent(display)}/`,
    followedAt,
  })
}

/**
 * JSON 트리를 재귀로 훑어 `string_list_data` 를 가진 노드를 모읍니다.
 * 인스타그램이 래퍼 키 이름(relationships_following 등)을 바꿔도 계속 동작합니다.
 */
function collectFromJson(node: unknown, out: Map<string, IgUser>, depth = 0) {
  if (depth > 12 || node === null || typeof node !== 'object') return

  if (Array.isArray(node)) {
    for (const child of node) collectFromJson(child, out, depth + 1)
    return
  }

  const obj = node as Record<string, unknown>
  const sld = obj.string_list_data
  if (Array.isArray(sld)) {
    const title = typeof obj.title === 'string' ? obj.title.trim() : ''
    for (const raw of sld) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      const href = typeof item.href === 'string' ? item.href : ''
      const value = typeof item.value === 'string' ? item.value.trim() : ''
      // 주소에서 뽑은 아이디를 가장 믿습니다. value 에 주소 전체가 들어 있는
      // 내보내기가 있어서, value 를 먼저 쓰면 같은 사람이 다른 이름이 됩니다.
      const fromHref = href ? (usernameFromHref(href) ?? '') : ''
      const fromValue = value.startsWith('http') ? (usernameFromHref(value) ?? '') : value
      const name = fromHref || fromValue || title
      if (name) pushUser(out, name, href, item.timestamp)
    }
    // title 에만 이름이 있고 string_list_data 가 빈 경우
    if (sld.length === 0 && typeof obj.title === 'string' && obj.title.trim()) {
      pushUser(out, obj.title, '')
    }
    return
  }

  for (const child of Object.values(obj)) collectFromJson(child, out, depth + 1)
}

/**
 * HTML 내보내기의 날짜 글자를 시각으로 바꿉니다.
 *
 *   한국어: "11월 10, 2026 8:31 오후"
 *   영어:   "Nov 10, 2026 8:31 pm"
 *
 * 파일에 적힌 날짜를 그대로 보여주려고 시간대를 옮기지 않습니다.
 * 인스타그램은 이 시각에 "UTC" 라고 적어 두지만 실제로는 다른 시간대로
 * 적는 경우가 있어서, 변환하면 오히려 하루가 밀려 보입니다.
 * 스냅샷끼리는 같은 기준으로 비교되므로 분석 결과에는 영향이 없습니다.
 */
export function parseExportDate(text: string): number | undefined {
  const trimmed = text.trim()

  const ko = trimmed.match(
    /(\d{1,2})월\s*(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(오전|오후)/,
  )
  if (ko) {
    const [, month, day, year, hour, minute, second, meridiem] = ko
    let h = Number(hour) % 12
    if (meridiem === '오후') h += 12
    const d = new Date(
      Number(year), Number(month) - 1, Number(day), h, Number(minute), Number(second ?? 0),
    )
    return Number.isNaN(d.getTime()) ? undefined : Math.floor(d.getTime() / 1000)
  }

  // 영어 등 다른 언어는 브라우저의 날짜 해석에 맡깁니다.
  if (/\d{4}/.test(trimmed)) {
    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
  }
  return undefined
}

/**
 * 링크 옆에 붙어 있는 날짜를 찾습니다. 내보내기는 이런 모양입니다.
 *
 *   <div>
 *     <div><a href="...">...</a></div>
 *     <div>11월 10, 2026 8:31 오후</div>
 *   </div>
 */
function dateNearAnchor(anchor: Element): number | undefined {
  let node: Element | null = anchor
  // 링크 자신과 그 부모까지 올라가며 바로 다음 칸을 살핍니다.
  for (let depth = 0; depth < 3 && node; depth++) {
    const sibling = node.nextElementSibling
    const text = sibling?.textContent?.trim()
    if (text) {
      const at = parseExportDate(text)
      if (at !== undefined) return at
    }
    node = node.parentElement
  }
  return undefined
}

function collectFromHtml(html: string, out: Map<string, IgUser>) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href') ?? ''
    // 아이디는 반드시 주소에서 뽑습니다. 링크 글자는 파일마다 달라서
    // (팔로워는 아이디, 팔로잉은 주소 전체) 그대로 쓰면 서로 안 맞습니다.
    const username = usernameFromHref(href)
    if (!username) continue
    pushUser(out, username, href, dateNearAnchor(anchor))
  }
}

/** 파일 내용만 보고 followers/following 을 추측합니다 (파일명이 바뀌었을 때의 대비). */
function guessKindFromContent(text: string): FileKind {
  const head = text.slice(0, 4096)
  if (/relationships_following/.test(head)) return 'following'
  if (/relationships_followers/.test(head)) return 'followers'
  if (/relationships_unfollowed_users/.test(head)) return 'unfollowedByMe'
  if (/relationships_blocked_users/.test(head)) return 'blockedByMe'
  return null
}

function parseText(text: string, path: string, kindHint: FileKind) {
  const users = new Map<string, IgUser>()
  const isHtml = /\.html?$/i.test(basename(path))

  if (isHtml) {
    collectFromHtml(text, users)
  } else {
    const data = JSON.parse(text)
    collectFromJson(data, users)
  }

  const kind: FileKind = kindHint ?? (isHtml ? null : guessKindFromContent(text))
  return { users: Array.from(users.values()), kind }
}

type Collected = {
  followers: Map<string, IgUser>
  following: Map<string, IgUser>
  /** 파일이 없었으면 undefined — "기록이 비어 있음"과 "기록을 모름"을 구분합니다 */
  unfollowedByMe?: Map<string, IgUser>
  blockedByMe?: Map<string, IgUser>
  sources: ParseResult['sources']
  warnings: string[]
}

function merge(target: Map<string, IgUser>, users: IgUser[]) {
  for (const u of users) {
    const existing = target.get(u.username)
    if (!existing) {
      target.set(u.username, u)
    } else if (u.followedAt && (!existing.followedAt || u.followedAt < existing.followedAt)) {
      existing.followedAt = u.followedAt
    }
  }
}

function absorb(c: Collected, path: string, text: string) {
  const declared = classifyFileName(path)
  const { users, kind } = parseText(text, path, declared)

  // 보조 파일은 비어 있어도 "있었다"는 사실 자체가 판별 근거입니다.
  if (kind === 'unfollowedByMe') {
    merge((c.unfollowedByMe ??= new Map()), users)
    return
  }
  if (kind === 'blockedByMe') {
    merge((c.blockedByMe ??= new Map()), users)
    return
  }
  if (!users.length) return

  if (kind === 'followers') {
    merge(c.followers, users)
  } else if (kind === 'following') {
    merge(c.following, users)
  } else {
    c.warnings.push(`${basename(path)}: 팔로워/팔로잉 중 무엇인지 알 수 없어 건너뛰었습니다.`)
    return
  }
  c.sources.push({ file: basename(path), kind, count: users.length })
}

async function absorbZip(c: Collected, file: File) {
  let index: ZipEntry[]
  try {
    index = await readZipIndex(file)
  } catch (err) {
    throw new ZipError(
      err instanceof Error ? err.message : 'ZIP 파일을 읽을 수 없습니다.',
    )
  }

  const wanted = index.filter((e) => classifyFileName(e.name) !== null)
  const hasLists = wanted.some((e) => {
    const kind = classifyFileName(e.name)
    return kind === 'followers' || kind === 'following'
  })
  if (!hasLists) {
    throw new ZipError(
      'ZIP 안에서 followers / following 파일을 찾지 못했습니다. ' +
        '"팔로워 및 팔로잉" 항목을 포함해 내보냈는지 확인해 주세요.',
    )
  }

  // JSON 과 HTML 이 모두 있으면 JSON 만 씁니다.
  const hasJson = wanted.some((e) => /\.json$/i.test(e.name))
  const chosen = hasJson ? wanted.filter((e) => /\.json$/i.test(e.name)) : wanted

  for (const entry of chosen) {
    try {
      const text = await readZipEntryText(file, entry)
      absorb(c, entry.name, text)
    } catch (err) {
      c.warnings.push(
        `${basename(entry.name)}: ${err instanceof Error ? err.message : '읽기 실패'}`,
      )
    }
  }
}

function isZip(file: File) {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip'
}

/** 사용자가 올린 파일들에서 팔로워/팔로잉 목록을 뽑아냅니다. */
export async function parseFiles(files: File[]): Promise<ParseResult> {
  const c: Collected = {
    followers: new Map(),
    following: new Map(),
    sources: [],
    warnings: [],
  }

  for (const file of files) {
    try {
      if (isZip(file)) {
        await absorbZip(c, file)
      } else if (/\.(json|html?)$/i.test(file.name)) {
        absorb(c, file.name, await file.text())
      } else {
        c.warnings.push(`${file.name}: zip / json / html 파일만 읽을 수 있습니다.`)
      }
    } catch (err) {
      c.warnings.push(`${file.name}: ${err instanceof Error ? err.message : '읽기 실패'}`)
    }
  }

  return {
    followers: Array.from(c.followers.values()),
    following: Array.from(c.following.values()),
    unfollowedByMe: c.unfollowedByMe ? Array.from(c.unfollowedByMe.values()) : undefined,
    blockedByMe: c.blockedByMe ? Array.from(c.blockedByMe.values()) : undefined,
    sources: c.sources,
    warnings: c.warnings,
  }
}
