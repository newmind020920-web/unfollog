/**
 * "계정이 사라졌다"고 사용자가 직접 확인한 아이디 목록.
 *
 * 내보내기 파일에는 계정이 살아 있는지가 적혀 있지 않습니다. 그래서
 * 프로필을 열어 본 사람만이 알 수 있고, 그 결과를 여기에 적어 둡니다.
 * 한 번 표시해 두면 다음 분석부터 '나를 언팔한 사람'에서 빠집니다.
 *
 * 브라우저에만 저장합니다. 스냅샷과 같은 원칙입니다.
 */

const KEY = 'unfollog.gone'

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function write(set: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Array.from(set)))
  } catch {
    // 저장이 막힌 브라우저에서는 이번 화면에서만 유지됩니다.
  }
}

export function loadGone(): Set<string> {
  return read()
}

export function markGone(username: string, gone: boolean): Set<string> {
  const set = read()
  if (gone) set.add(username)
  else set.delete(username)
  write(set)
  return set
}

export function clearGone(): Set<string> {
  write(new Set())
  return new Set()
}
