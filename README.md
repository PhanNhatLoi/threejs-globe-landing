# Three.js Globe Landing Starter

Landing page starter dùng Three.js với địa cầu 3D tương tác (xoay/zoom) + nền sao.

## Yêu cầu

- Node.js 24 (khuyên dùng qua `nvm`)
- npm 11+

## Chạy local

```bash
nvm use 24
npm install
npm run dev
```

Mở địa chỉ Vite in ra terminal (mặc định `http://localhost:5173`).

## Build production

```bash
npm run build
npm run preview
```

## Thành phần chính

- `src/main.js`: setup scene Three.js, globe, atmosphere, stars, controls, animation loop
- `src/style.css`: layout landing page + style cho canvas và hero text

## Tính năng đã có sẵn

- Địa cầu 3D có thể kéo xoay và zoom (`OrbitControls`)
- Auto rotate có thể bật/tắt bằng panel `lil-gui`
- Hiệu ứng atmosphere glow và starfield
- Responsive cơ bản cho desktop/mobile
