# Frontend — Video Studio Pro

Next.js app. **Hướng dẫn đầy đủ** (Docker, LAN, dev local, chất lượng ghép): xem [README.md](../README.md) ở thư mục gốc.

## Dev nhanh

```powershell
cd D:\tbui\edit-video\frontend
copy env.local.example .env.local
npm install
npm run dev:local
```

Mở http://localhost:3004 — cần backend Docker chạy tại port **8003**.

Hoặc từ thư mục gốc: `.\scripts\dev-frontend.ps1`

## Docker (production / boss)

Không chạy `npm` trực tiếp — dùng Docker Compose từ thư mục gốc (port **3003**). Xem [README.md](../README.md).
