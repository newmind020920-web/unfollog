// 홍보용 캡처. 가짜 데이터로 찍습니다 — 실제 아이디가 박히면 안 됩니다.
import pw from '/opt/node-tools/node_modules/playwright/index.js'
import { rmSync, mkdirSync, copyFileSync } from 'node:fs'

const SITE = process.env.SITE ?? 'http://127.0.0.1:4173'
copyFileSync(new URL('frame.html', import.meta.url), new URL('../dist/promo-frame.html', import.meta.url))
const OUT = 'shots'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT)

const b = await pw.chromium.launch({ args: ['--no-proxy-server', '--no-sandbox'] })
const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
const app = p.frameLocator('#app')
const settled = () =>
  p.waitForFunction(() => {
    const d = document.querySelector('#app')?.contentDocument
    return d && !d.querySelector('[data-progress]')
  }, { timeout: 90000 })

/** 4:5 로 잘라 냅니다. 피드에서 가장 크게 보이는 비율이에요. */
const shot = (name, y) =>
  p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y, width: 1080, height: 1350 } })

await p.goto(`${SITE}/promo-frame.html`, { waitUntil: 'networkidle' })
await p.waitForTimeout(800)

// 1. 첫 화면
await shot('1-landing', 0)

// 2. 분석 중 — "파일은 네트워크로 전송되지 않아요" 가 보이는 장면
const up = app.locator('input[type=file]').first()
await up.setInputFiles('last-month.zip')
await p.waitForTimeout(650)
await shot('2-analyzing', 0).catch(() => {})
await settled()
await p.waitForTimeout(900)

// 3. 두 번째 파일 → 결과
await app.locator('input[type=file]').first().setInputFiles('today.zip')
await settled()
await p.waitForTimeout(900)
await shot('3-result', 0)

// 4. 언팔 명단
await app.locator('[data-row="unfollowers"]').click()
await p.waitForTimeout(700)
// 설명 상자가 길어서, 명단이 시작되는 지점에 정확히 맞춥니다.
await app.locator('select[aria-label="정렬 기준"]').first().evaluate((el) =>
  el.scrollIntoView({ block: 'start' }),
)
await p.waitForTimeout(700)
// 명단이 네 줄뿐이라 더 내려가지 않습니다. 그래서 스크롤 대신 자르는 위치를
// 내려서, 위에 걸리는 설명 꼬리를 뺍니다. 잘린 문장만 보이면 뜻이 안 통해요.
await shot('4-list', 240)

// 5. 차단 의심
await app.locator('text=뒤로').first().click()
await p.waitForTimeout(600)
await app.locator('[data-row="blocked"]').click()
await p.waitForTimeout(700)
await p.mouse.move(540, 1100)
await p.mouse.wheel(0, 480)
await p.waitForTimeout(900)
await shot('5-blocked', 0)

await b.close()
console.log('캡처 끝')
