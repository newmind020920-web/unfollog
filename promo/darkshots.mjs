// 카드뉴스 윗단에 넣을 다크 모드 화면. 가짜 데이터로 찍습니다.
import pw from '/opt/node-tools/node_modules/playwright/index.js'
import { rmSync, mkdirSync, copyFileSync } from 'node:fs'

const SITE = process.env.SITE ?? 'http://127.0.0.1:4173'
copyFileSync(new URL('frame.html', import.meta.url), new URL('../dist/promo-frame.html', import.meta.url))
const OUT = 'darkshots'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT)

const b = await pw.chromium.launch({ args: ['--no-proxy-server', '--no-sandbox'] })
const ctx = await b.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const p = await ctx.newPage()
const app = p.frameLocator('#app')
const settled = () =>
  p.waitForFunction(() => {
    const d = document.querySelector('#app')?.contentDocument
    return d && !d.querySelector('[data-progress]')
  }, { timeout: 90000 })

const dark = () =>
  p.evaluate(() => {
    const d = document.querySelector('#app').contentDocument
    d.documentElement.setAttribute('data-theme', 'dark')
    d.body.style.background = 'transparent'
  })

const H = 700 // 카드 윗단 높이와 같게 찍습니다. 나중에 늘이면 뭉개져요.
const shot = (name, y) =>
  p.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y, width: 1080, height: H } })

/** 어떤 요소가 윗단 가운데쯤 오도록 자를 위치를 구합니다. */
async function around(sel, offset = 90) {
  const box = await app.locator(sel).first().boundingBox()
  return Math.max(0, Math.round(box.y - offset))
}

await p.goto(`${SITE}/promo-frame.html`, { waitUntil: 'networkidle' })
await dark()
await p.waitForTimeout(700)
// 업로드 칸이 가운데 오게
await shot('upload', await around('text=파일을 여기에 끌어다 놓으세요', 150))

await app.locator('input[type=file]').first().setInputFiles('last-month.zip')
await settled(); await dark(); await p.waitForTimeout(600)
await app.locator('input[type=file]').first().setInputFiles('today.zip')
await settled(); await dark(); await p.waitForTimeout(900)
// 헤드라인이 잘리지 않게 맨 위부터
await shot('result', 0)

await app.locator('[data-row="unfollowers"]').click()
await p.waitForTimeout(700); await dark()
// 설명 상자 말고 아이디가 보이게
await shot('list', await around('text=@cocoa_days656', 120))

await b.close()
console.log('다크 화면 완료')
