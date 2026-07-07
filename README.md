# Video Studio Pro

Ứng dụng upload, xem trước và ghép nối video (FFmpeg). Chạy bằng Docker Compose.

## Port mặc định

| Service  | Port | Ghi chú |
|----------|------|---------|
| Frontend | **3003** | Giao diện web |
| Backend  | **8003** | API + WebSocket |
| Database | **5433** | PostgreSQL (dev/local) |

Cấu hình trong file `.env` (copy từ `.env.example`).

## Chạy Docker (cho boss / máy trong LAN)

### 1. Cấu hình `.env`

```env
FRONTEND_PORT=3003
BACKEND_PORT=8003
DB_PORT=5433

# IP LAN của máy chạy Docker — máy khác trong mạng phải gọi được IP này
NEXT_PUBLIC_API_URL=http://192.168.1.26:8003
```

> **Quan trọng:** `NEXT_PUBLIC_API_URL` được **nhúng vào frontend lúc build**. Đổi IP/port → phải **build lại frontend** (xem bên dưới).

### 2. Khởi động

```powershell
cd D:\tbui\edit-video
docker compose --env-file .env up -d --build
```

### 3. Truy cập

- **Giao diện:** http://192.168.1.26:3003
- **API health:** http://192.168.1.26:8003/health

Sau khi cập nhật code: **Ctrl+F5** (hard refresh) trên trình duyệt.

### 4. Firewall Windows

Cho phép inbound TCP **3003** và **8003** nếu máy khác trong LAN không vào được.

---

## Dev local (chỉ lập trình viên)

Chạy **frontend** trên máy, **backend** vẫn qua Docker.

```powershell
# Terminal 1 — backend + db (nếu chưa chạy)
cd D:\tbui\edit-video
docker compose --env-file .env up -d db backend

# Terminal 2 — frontend local port 3004
.\scripts\dev-frontend.ps1
```

Hoặc thủ công:

```powershell
cd D:\tbui\edit-video\frontend
copy env.local.example .env.local
npm install
npm run dev:local
```

Mở http://localhost:3004 — API trỏ tới `http://127.0.0.1:8003` (trong `frontend/.env.local`).

> **Không** chạy `npm run dev` từ thư mục gốc `edit-video` — không có `package.json` ở đó.

| Môi trường | FE port | API URL |
|------------|---------|---------|
| Docker (boss) | 3003 | `http://192.168.1.26:8003` (trong `.env` gốc) |
| Dev local | 3004 | `http://127.0.0.1:8003` (trong `frontend/.env.local`) |

`frontend/.env.local` **không** dùng cho build Docker (đã loại trong `.dockerignore`).

---

## Lệnh Docker thường dùng

```powershell
cd D:\tbui\edit-video

# Xem trạng thái
docker compose --env-file .env ps

# Build lại toàn bộ
docker compose --env-file .env up -d --build --renew-anon-volumes

# Chỉ build lại frontend (sau khi đổi NEXT_PUBLIC_API_URL hoặc code FE)
docker compose --env-file .env up -d --build --no-deps --renew-anon-volumes frontend

# Chỉ restart backend (code BE mount volume, thường chỉ cần restart)
docker compose --env-file .env restart backend

# Xem log
docker logs video_backend -f
docker logs video_frontend -f

# Dừng
docker compose --env-file .env down
```

### Reset toàn bộ dữ liệu

Xóa DB, uploads, outputs, previews và khởi động lại:

```powershell
.\scripts\reset-all.ps1
```

---

## Quy trình sử dụng

1. Tab **Media** — kéo thả video, xem trước (blob local hoặc preview server).
2. **Upload & Tạo Task** — upload lên server và tạo task ghép.
3. Tab **Tasks** — chọn task → xem **độ phân giải từng video nguồn** → chọn **Đầu ra mong muốn** (chỉ mức ≤ nguồn) → **Bắt đầu ghép**.
4. Theo dõi tiến độ FFmpeg ở **Timeline** (%, tốc độ, ETA, log).
5. Khi xong — **Xem kết quả** / **Tải về** ở panel phải.

### Thời gian hiển thị

- **Thời gian ghép** — từ lúc bấm ghép đến khi FFmpeg xong.
- **Độ dài video** — tổng thời lượng nội dung output.
- Task ghép **trước** bản cập nhật có thể không có “thời gian ghép”; ghép task mới để có đủ.

---

## Chất lượng video khi ghép

Merge **encode lại** (không copy stream nguyên bản). Trước khi ghép có thể chọn preset đầu ra:

| Preset | Độ phân giải |
|--------|----------------|
| Cao nhất (theo nguồn) | Max trong các clip |
| 4K UHD | 3840×2160 |
| 2K (1440p) | 2560×1440 |
| Full HD | 1920×1080 |
| HD | 1280×720 |

Chỉ hiện preset **bằng hoặc thấp hơn** nguồn (nguồn 2K không chọn 4K).

Cấu hình encode mặc định:

| Thông số | Giá trị |
|----------|---------|
| Độ phân giải | Cao nhất trong các clip nguồn (tối đa **4K** 3840×2160) |
| FPS | Cao nhất trong các clip |
| Video | H.264, **CRF 18**, preset **slow** |
| Audio | AAC **256k**, 48 kHz |

- Clip **4K** → output **4K** (nếu tất cả nguồn cho phép).
- Ghép **4K + 1080p** → canvas **4K**; clip 1080p được scale lên (không thêm chi tiết thật).
- File output **lớn hơn** và ghép **chậm hơn** so với preset nhanh / 1080p.

### Kiểm tra độ phân giải file output

```powershell
docker exec video_backend ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,r_frame_rate -of default=noprint_wrappers=1 "/app/outputs/merged_XXXXX.mp4"
```

4K = `width=3840`, `height=2160`.

---

## Cấu trúc thư mục

```
edit-video/
├── .env                 # Port + NEXT_PUBLIC_API_URL (Docker)
├── docker-compose.yml
├── frontend/            # Next.js
├── backend/             # FastAPI + FFmpeg
├── uploads/             # Video đã upload
├── outputs/             # Video đã ghép
├── previews/            # Preview H.264 cho trình duyệt
└── scripts/
    ├── dev-frontend.ps1
    ├── reset-all.ps1
    └── test-be-flow.ps1
```

---

## Lỗi thường gặp

### WebSocket / Axios Network Error (`192.168.1.26:8003`)

- **Backend chưa chạy** — `docker compose ps`, chỉ có `video_frontend` Up là chưa đủ.
- Firewall chặn port **8003**.
- `NEXT_PUBLIC_API_URL` sai IP → sửa `.env` và **build lại frontend**.

### Preview task báo “Định dạng video không được hỗ trợ…”

- Thường do tên file có **ký tự Unicode** (tiếng Việt, `｜`…) — đã xử lý ở backend.
- Tab **Media** vẫn xem được vì dùng blob local; tab **Tasks** gọi API server.

### `npm run dev` ở thư mục gốc lỗi

Chạy trong `frontend/` hoặc dùng `.\scripts\dev-frontend.ps1`.

### Ghép lâu / máy nặng

4K + `preset=slow` với clip dài có thể mất **hàng chục phút**. Theo dõi log Timeline.

### Task kẹt “Đang ghép” sau khi rebuild Docker

- **Có FFmpeg đang chạy** (`docker exec video_backend ps aux | grep ffmpeg`) → **chờ thêm**.
- **Không có FFmpeg** mà task vẫn `processing` → trên UI: panel phải → **Đặt lại task (nếu kẹt sau restart)**, rồi **Bắt đầu ghép** lại.

Hoặc API: `POST /tasks/{id}/reset`

### Đổi IP LAN

1. Sửa `NEXT_PUBLIC_API_URL` trong `.env`
2. `docker compose --env-file .env up -d --build --no-deps --renew-anon-volumes frontend`
3. Boss hard refresh (Ctrl+F5)

---

## API chính

| Method | Endpoint | Mô tả |
|--------|----------|--------|
| POST | `/upload` | Upload video |
| POST | `/tasks` | Tạo task |
| GET | `/tasks/{id}/merge-info` | Độ phân giải nguồn + preset đầu ra khả dụng |
| POST | `/tasks/{id}/merge` | Bắt đầu ghép (`body: { "output_preset": "1080p" }`) |
| POST | `/tasks/{id}/reset` | Đặt lại task kẹt (processing/failed → pending) |
| GET | `/tasks` | Danh sách task |
| GET | `/videos/{id}/preview` | Preview H.264 |
| GET | `/download/{filename}?inline=true` | Phát/tải output |
| WS | `/ws/tasks` | Tiến độ realtime |
