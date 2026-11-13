/**
 * 사이트를 "파일 하나짜리 페이지"로 묶습니다.
 *
 * 스크립트와 스타일을 HTML 안에 넣고, 글꼴만 fonts/ 폴더에 따로 둡니다.
 * 외부 스크립트를 못 쓰는 호스팅(claude.ai 아티팩트 등)에 그대로 올릴 수 있습니다.
 *
 *   node scripts/build-artifact.mjs <출력 폴더>
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const outDir = resolve(process.argv[2] ?? 'dist-artifact')
const buildDir = mkdtempSync(join(tmpdir(), 'unfollog-artifact-'))

execFileSync('npx', ['vite', 'build', '--outDir', buildDir, '--emptyOutDir', '--logLevel', 'warn'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_ARTIFACT: '1' },
})

const assets = join(buildDir, 'assets')
const names = readdirSync(assets)
const cssFile = names.find((n) => n.endsWith('.css'))
const jsFile = names.find((n) => n.endsWith('.js'))
const fonts = names.filter((n) => n.endsWith('.woff2'))
if (!cssFile || !jsFile) throw new Error('빌드 결과에서 CSS/JS 를 찾지 못했습니다.')

// CSS 가 HTML 안으로 들어오므로 글꼴 경로를 페이지 기준으로 바꿉니다.
const css = readFileSync(join(assets, cssFile), 'utf8').replace(
  /url\(\.\/([^)]+\.woff2)\)/g,
  'url(fonts/$1)',
)
const js = readFileSync(join(assets, jsFile), 'utf8')
if (/<\/script/i.test(js)) throw new Error('번들 안에 </script 가 있어 그대로 넣을 수 없습니다.')

// 호스트가 <html>/<head>/<body> 를 감싸 주므로 내용만 씁니다.
const html = `<title>언팔로그</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'fonts'), { recursive: true })
writeFileSync(join(outDir, 'index.html'), html)
for (const f of fonts) cpSync(join(assets, f), join(outDir, 'fonts', f))
writeFileSync(join(outDir, 'files.json'), JSON.stringify(fonts.map((f) => ({ path: `fonts/${f}` }))))
rmSync(buildDir, { recursive: true, force: true })

console.log(`${outDir}/index.html ${(html.length / 1024).toFixed(0)}KB + 글꼴 ${fonts.length}개`)
