// 홍보영상용 가짜 내보내기. 실제 사람의 아이디가 영상에 찍히면 안 됩니다.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const head = '<!doctype html><html><head><meta charset="utf-8"></head><body><main role="main">'
const tail = '</main></body></html>'
const fol = (u, d) => `<div class="pam"><div class="_a6-p"><div><div><a href="https://www.instagram.com/${u}">${u}</a></div><div>${d}</div></div></div></div>`
const ing = (u, d) => `<div class="pam"><h2>${u}</h2><div class="_a6-p"><div><div><a href="https://www.instagram.com/_u/${u}">https://www.instagram.com/_u/${u}</a></div><div>${d}</div></div></div></div>`

// 흔한 영문 닉네임 조합 — 실제 계정과 겹칠 가능성을 낮추려 숫자를 섞습니다.
const A = ['sunny','mint','cloud','daily','salt','maple','river','moon','cocoa','linen',
           'paper','olive','peach','denim','amber','velvet','cider','hazel','pine','cotton']
const B = ['log','note','room','mood','film','walk','days','diary','studio','table']
const names = []
for (let i = 0; i < 860; i++) {
  names.push(`${A[i % A.length]}_${B[(i * 7) % B.length]}${100 + ((i * 37) % 900)}`)
}
const date = (i) => `${1 + (i % 12)}월 ${1 + (i % 28)}, ${2017 + (i % 9)} ${1 + (i % 11)}:${String(i % 60).padStart(2, '0')} ${i % 2 ? '오후' : '오전'}`

function build(dir, followers, following) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(`${dir}/connections/followers_and_following`, { recursive: true })
  const base = `${dir}/connections/followers_and_following`
  writeFileSync(`${base}/followers_1.html`, head + followers.map((n, i) => fol(n, date(i))).join('') + tail)
  writeFileSync(`${base}/following.html`, head + following.map((n, i) => ing(n, date(i))).join('') + tail)
  execSync(`cd ${dir} && zip -qr ../${dir.split('/').pop()}.zip connections`)
}

// 지난달: 팔로워 842, 팔로잉 391
const f1 = names.slice(0, 842)
const g1 = names.slice(0, 391)
build('last-month', f1, g1)

// 오늘: 6명이 떠났습니다.
// 그중 2명은 내 팔로잉에서도 같이 사라져서 "차단 의심" 으로 잡힙니다.
// 나머지 4명은 내가 아직 팔로우하고 있으니 "나를 언팔한 사람" 입니다.
const blocked = [f1[3], f1[17]]
const unfollowed = [f1[40], f1[88], f1[210], f1[604]]
const gone = [...blocked, ...unfollowed]
const f2 = f1.filter((n) => !gone.includes(n)).concat(['newbie_film204'])
const g2 = g1.filter((n) => !blocked.includes(n))
build('today', f2, g2)

console.log(`지난달 팔로워 ${f1.length} / 팔로잉 ${g1.length}`)
console.log(`오늘   팔로워 ${f2.length} / 팔로잉 ${g2.length}`)
console.log(`→ 나를 언팔 ${unfollowed.length}명 · 차단 의심 ${blocked.length}명`)
