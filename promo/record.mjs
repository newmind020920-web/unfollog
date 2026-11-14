import pw from '/opt/node-tools/node_modules/playwright/index.js'
import { copyFileSync, rmSync, mkdirSync } from 'node:fs'

const SITE = process.env.SITE ?? 'http://127.0.0.1:4173'
// 확대 틀은 사이트와 같은 주소에서 나와야 합니다. 다른 주소면 브라우저가
// 안쪽 화면을 건드리지 못하게 막아서 조작이 안 됩니다.
copyFileSync(new URL('frame.html', import.meta.url), new URL('../dist/promo-frame.html', import.meta.url))

const DIR = 'raw'
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR)

const b = await pw.chromium.launch({ args: ['--no-proxy-server', '--no-sandbox'] })
// 녹화는 CSS 픽셀 기준이라 화면 배율이 반영되지 않습니다. 그래서 휴대폰 화면을
// 2배로 늘린 promo.html 위에서 찍습니다. 글자가 늘어난 크기로 다시 그려집니다.
const ctx = await b.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  recordVideo: { dir: DIR, size: { width: 1080, height: 1920 } },
})
const p = await ctx.newPage()
const app = p.frameLocator('#app')

const settled = () =>
  p.waitForFunction(
    () => {
      const d = document.querySelector('#app')?.contentDocument
      return d && !d.querySelector('[data-progress]')
    },
    { timeout: 90000 },
  )

async function caption(text, sub = '') {
  await p.evaluate(([t, s]) => {
    document.querySelector('#cap')?.remove()
    const el = document.createElement('div')
    el.id = 'cap'
    el.innerHTML = `<div class="in"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`
    document.body.appendChild(el)
  }, [text, sub])
}
const clearCap = () => p.evaluate(() => document.querySelector('#cap')?.remove())

/** 손가락이 닿은 자리. 없으면 혼자 움직이는 화면처럼 보입니다. */
async function tap(sel) {
  const box = await app.locator(sel).first().boundingBox()
  await p.evaluate(([x, y]) => {
    const d = document.createElement('div')
    d.className = 'tapring'
    d.style.left = x + 'px'
    d.style.top = y + 'px'
    document.body.appendChild(d)
    setTimeout(() => d.remove(), 700)
  }, [box.x + box.width / 2, box.y + box.height / 2])
  await p.waitForTimeout(280)
  await app.locator(sel).first().click()
}

async function scroll(dy) {
  await p.mouse.move(540, 1150)
  await p.mouse.wheel(0, dy)
}

const CSS = `
  #cap{position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:44px 40px 62px;
    background:linear-gradient(to top,rgba(10,12,16,.93) 58%,rgba(10,12,16,0));
    pointer-events:none;font-family:Pretendard,-apple-system,system-ui,sans-serif}
  #cap .in{animation:capin .35s ease both}
  #cap b{display:block;color:#fff;font-size:54px;font-weight:800;line-height:1.3;
    letter-spacing:-0.035em;text-align:center}
  #cap span{display:block;margin-top:16px;color:#c7cdd6;font-size:34px;line-height:1.4;
    text-align:center;font-weight:500;letter-spacing:-0.02em}
  @keyframes capin{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  .tapring{position:fixed;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;
    background:rgba(142,51,196,.3);border:4px solid rgba(142,51,196,.85);z-index:99998;
    pointer-events:none;animation:ring .7s ease-out both}
  @keyframes ring{0%{transform:scale(.3);opacity:0}25%{transform:scale(1);opacity:1}
    100%{transform:scale(1.5);opacity:0}}
  #end{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:#fff;
    animation:endin .4s ease both;font-family:Pretendard,-apple-system,system-ui,sans-serif}
  @keyframes endin{from{opacity:0}to{opacity:1}}
  #end .mark{width:250px;height:250px;display:block;margin:0 auto 54px}
  #end .name{font-size:74px;font-weight:800;letter-spacing:-0.04em;color:#191f28;text-align:center}
  #end .url{margin-top:28px;font-size:46px;font-weight:700;color:#8E33C4;text-align:center}
  #end .sub{margin-top:22px;font-size:34px;color:#6b7684;font-weight:500;text-align:center}
`

await p.goto(`${SITE}/promo-frame.html`, { waitUntil: 'networkidle' })
await p.addStyleTag({ content: CSS })
await p.waitForTimeout(1000)

// ── 1. 문제 제기
await caption('나를 언팔한 사람,', '누군지 아세요?')
await p.waitForTimeout(2100)

// ── 2. 첫 파일
await clearCap()
await caption('인스타에서 받은 파일을 올리면')
await app.locator('input[type=file]').first().setInputFiles('last-month.zip')
await settled()
await p.waitForTimeout(1200)

// ── 3. 두 번째 파일 — 여기서 비교가 생깁니다
await caption('한 달 뒤 한 번 더 올리면')
await p.waitForTimeout(1400)
const [chooser] = await Promise.all([
  p.waitForEvent('filechooser'),
  tap('header [data-reupload]'),
])
await chooser.setFiles('today.zip')
await settled()
await clearCap()
await p.waitForTimeout(1600)

// ── 4. 결과
await caption('그사이 떠난 사람이 나와요')
await p.waitForTimeout(2000)

// ── 5. 명단
await clearCap()
await tap('[data-row="unfollowers"]')
await p.waitForTimeout(700)
await caption('누가, 언제 떠났는지까지')
await p.waitForTimeout(800)
await scroll(620)
await p.waitForTimeout(2600)

// ── 6. 안전함
await clearCap()
await p.waitForTimeout(350)
await caption('로그인 안 해요', '아이디도 비밀번호도 묻지 않아요')
await p.waitForTimeout(2100)

// ── 7. 주소
await clearCap()
await p.evaluate(() => {
  const el = document.createElement('div')
  el.id = 'end'
  el.innerHTML = `<div>
    <svg class="mark" viewBox="0 0 120 120">
      <defs><linearGradient id="eg" x1="0" y1="120" x2="120" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#f7963c"/><stop offset=".52" stop-color="#d42e86"/>
        <stop offset="1" stop-color="#7b3fe4"/></linearGradient></defs>
      <circle cx="60" cy="60" r="60" fill="url(#eg)"/>
      <g transform="translate(22 22) scale(3.15)">
        <path d="M16.8 6.25A7.5 7.5 0 1 1 7.2 6.25" fill="none" stroke="#fff"
              stroke-width="3.3" stroke-linecap="round"/></g>
    </svg>
    <div class="name">언팔로그</div>
    <div class="url">unfollog.pages.dev</div>
    <div class="sub">무료 · 로그인 없이</div></div>`
  document.body.appendChild(el)
})
await p.waitForTimeout(2500)

await ctx.close()
await b.close()
console.log('녹화 끝')
