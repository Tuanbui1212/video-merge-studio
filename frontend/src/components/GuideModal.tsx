'use client';

import React from 'react';
import { X, BookOpen } from 'lucide-react';
import ConnectionStatus from '@/components/ConnectionStatus';
import { API_URL, BACKEND_PORT, FRONTEND_PORT } from '@/lib/config';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    title: '1. Khởi động hệ thống',
    body: `Mở terminal tại thư mục dự án và chạy:\n\ndocker compose up -d --build\n\nSau đó mở trình duyệt: http://localhost:${FRONTEND_PORT}`,
  },
  {
    title: '2. Kiểm tra kết nối FE ↔ BE ↔ DB',
    body: 'Phần "Trạng thái kết nối" bên dưới phải hiện xanh cho cả Backend và Database. Nếu đỏ, kiểm tra file .env (port) rồi chạy lại docker compose.',
  },
  {
    title: '3. Chuẩn bị video test',
    body: 'Chuẩn bị ít nhất 2 file video nhỏ (MP4/MOV/AVI, mỗi file vài giây đến vài chục giây). Video càng nhẹ càng test nhanh.',
  },
  {
    title: '4. Upload & ghép video',
    body: 'Ở tab Media (bên trái):\n• Kéo thả hoặc click "Import Media" để chọn video\n• Thứ tự trong danh sách = thứ tự ghép\n• Bấm "Merge to Timeline" khi có ≥ 2 video',
  },
  {
    title: '5. Theo dõi tiến trình',
    body: 'Chuyển sang tab Tasks:\n• Trạng thái "Active" = đang xử lý bằng FFmpeg\n• "Done" = ghép xong\n• "Error" = xem chi tiết lỗi (codec, file hỏng...)',
  },
  {
    title: '6. Tải video kết quả',
    body: 'Khi task hiện "Done", bấm "Download File" để tải file MP4 đã ghép.',
  },
  {
    title: '7. Kiểm tra API trực tiếp (tuỳ chọn)',
    body: `• Health: GET ${API_URL}/health\n• Danh sách task: GET ${API_URL}/tasks\n• Swagger docs: ${API_URL}/docs`,
  },
];

export default function GuideModal({ open, onClose }: GuideModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl border border-[#282828] bg-[#141414] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#282828] shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-gray-100">Hướng dẫn test luồng ghép video</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white rounded-md hover:bg-[#282828] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 custom-scrollbar">
          <p className="text-xs text-gray-400 leading-relaxed">
            Ứng dụng này nhận nhiều video nhỏ, upload lên server, rồi ghép tuần tự thành một video lớn bằng FFmpeg.
            Luồng đầy đủ: <span className="text-gray-300">Upload → Merge → Xử lý → Download</span>.
          </p>

          <ConnectionStatus />

          <div className="space-y-4">
            {STEPS.map((step) => (
              <div key={step.title} className="rounded-lg border border-[#282828] bg-[#181818] p-4">
                <h3 className="text-xs font-semibold text-blue-400 mb-2">{step.title}</h3>
                <p className="text-xs text-gray-400 whitespace-pre-line leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4">
            <p className="text-xs text-amber-200/90 leading-relaxed">
              <strong className="font-semibold">Lưu ý:</strong> Cần ít nhất 2 video. Sau khi bấm Merge, hãy chuyển sang tab Tasks để xem tiến trình.
              Nếu lỗi kết nối, đảm bảo <code className="text-amber-100">NEXT_PUBLIC_API_URL</code> trong{' '}
              <code className="text-amber-100">.env</code> trùng với <code className="text-amber-100">BACKEND_PORT</code> ({BACKEND_PORT}),
              rồi rebuild frontend: <code className="text-amber-100">docker compose up -d --build frontend</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
