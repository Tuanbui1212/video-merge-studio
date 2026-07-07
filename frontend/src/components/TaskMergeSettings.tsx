'use client';

import type { TaskMergeInfo } from '@/lib/resolution';
import { presetOptionLabel } from '@/lib/resolution';
import { Monitor, Loader2 } from 'lucide-react';
import React from 'react';

interface TaskMergeSettingsProps {
  mergeInfo: TaskMergeInfo | null;
  loading?: boolean;
  selectedPreset: string;
  onPresetChange: (presetId: string) => void;
}

function TaskMergeSettingsInner({
  mergeInfo,
  loading = false,
  selectedPreset,
  onPresetChange,
}: TaskMergeSettingsProps) {
  return (
    <div className="p-2.5 rounded-md bg-[#181818] border border-[#282828] space-y-2">
      <div className="flex items-center gap-1.5">
        <Monitor className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">
          Độ phân giải
        </p>
      </div>

      {loading && (
        <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Đang phân tích video nguồn...
        </p>
      )}

      {mergeInfo && !loading && (
        <>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Cao nhất trong task:{' '}
            <span className="text-violet-300 font-mono">
              {mergeInfo.max_source_width}×{mergeInfo.max_source_height}
            </span>{' '}
            <span className="text-gray-500">({mergeInfo.max_source_label})</span>
          </p>

          <label className="block space-y-1">
            <span className="text-[10px] text-gray-500">Đầu ra mong muốn</span>
            <select
              value={selectedPreset}
              onChange={(e) => onPresetChange(e.target.value)}
              className="w-full rounded bg-[#0e0e0e] border border-[#383838] text-[11px] text-gray-200 px-2 py-1.5 focus:outline-none focus:border-violet-500/60"
            >
              {mergeInfo.output_options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {presetOptionLabel(opt)}
                </option>
              ))}
            </select>
          </label>

          <p className="text-[9px] text-gray-600 leading-relaxed">
            Chỉ hiện mức bằng hoặc thấp hơn nguồn — không chọn 4K khi nguồn chỉ 2K.
          </p>
        </>
      )}

      {!loading && !mergeInfo && (
        <p className="text-[10px] text-gray-600">Chưa đọc được metadata nguồn.</p>
      )}
    </div>
  );
}

export default React.memo(TaskMergeSettingsInner);
