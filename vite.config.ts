import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // 어떤 호스팅에서 빌드하든 집계 주소가 들어왔는지 로그로 남깁니다.
  // 값은 찍지 않습니다 — 빌드 로그는 남에게 보일 수 있습니다.
  const api = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL
  console.log(
    api
      ? `[unfollog] 방문 집계 켜짐 (주소 ${api.length}자)`
      : '[unfollog] 방문 집계 꺼짐 — VITE_API_URL 이 비어 있습니다 (빌드 환경변수로 넣어야 합니다)',
  )

  return {
    plugins: [react(), tailwindcss()],
    base: './',
  }
})
