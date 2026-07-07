'use client';

import React, { useEffect, useState } from 'react';
import { api, isAxiosError } from '@/lib/api';
import { API_URL, BACKEND_PORT, DB_PORT, FRONTEND_PORT } from '@/lib/config';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type Status = 'checking' | 'ok' | 'error';

interface HealthState {
  backend: Status;
  database: Status;
  message: string;
}

export default function ConnectionStatus() {
  const [health, setHealth] = useState<HealthState>({
    backend: 'checking',
    database: 'checking',
    message: 'Đang kiểm tra kết nối...',
  });

  useEffect(() => {
    const check = async () => {
      try {
        const res = await api.get('/health', { timeout: 5000 });
        const dbOk = res.data?.database === 'connected';
        setHealth({
          backend: 'ok',
          database: dbOk ? 'ok' : 'error',
          message: dbOk
            ? `Backend (${BACKEND_PORT}) và Database (${DB_PORT}) hoạt động bình thường.`
            : 'Backend phản hồi nhưng database chưa kết nối.',
        });
      } catch (err: unknown) {
        const detail =
          isAxiosError(err) && err.code === 'ECONNABORTED'
            ? 'Backend không phản hồi (timeout).'
            : `Không kết nối được Backend tại ${API_URL}. Hãy chạy: docker compose up -d`;
        setHealth({
          backend: 'error',
          database: 'error',
          message: detail,
        });
      }
    };

    check();
  }, []);

  return (
    <div className="rounded-lg border border-[#282828] bg-[#181818] p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-200">Trạng thái kết nối</p>

      <div className="space-y-2 text-xs">
        <StatusRow label={`Frontend (port ${FRONTEND_PORT})`} status="ok" note="Trang web đã tải" />
        <StatusRow
          label={`Backend API (port ${BACKEND_PORT})`}
          status={health.backend}
          note={API_URL}
        />
        <StatusRow
          label={`Database PostgreSQL (port ${DB_PORT})`}
          status={health.database}
          note="Qua backend /health"
        />
      </div>

      <p
        className={`text-[11px] leading-relaxed ${
          health.backend === 'ok' && health.database === 'ok'
            ? 'text-green-400'
            : health.backend === 'checking'
              ? 'text-gray-400'
              : 'text-red-400'
        }`}
      >
        {health.message}
      </p>
    </div>
  );
}

function StatusRow({
  label,
  status,
  note,
}: {
  label: string;
  status: Status;
  note: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-gray-300 font-medium">{label}</p>
        <p className="text-[10px] text-gray-500 truncate">{note}</p>
      </div>
      <div className="shrink-0">
        {status === 'checking' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        {status === 'ok' && <CheckCircle className="w-4 h-4 text-green-500" />}
        {status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
      </div>
    </div>
  );
}
