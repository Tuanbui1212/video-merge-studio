'use client';

import { Separator } from 'react-resizable-panels';

interface ResizeSeparatorProps {
  /** `vertical` = thanh dọc (kéo trái/phải), `horizontal` = thanh ngang (kéo lên/xuống) */
  direction: 'vertical' | 'horizontal';
}

export default function ResizeSeparator({ direction }: ResizeSeparatorProps) {
  const isVertical = direction === 'vertical';

  return (
    <Separator
      className={
        isVertical
          ? 'group shrink-0 flex w-[5px] items-center justify-center bg-[#0e0e0e] border-x border-[#282828] hover:bg-[#1a1a1a] data-[separator=active]:bg-blue-950/40 transition-colors'
          : 'group shrink-0 flex h-[5px] items-center justify-center bg-[#0e0e0e] border-y border-[#282828] hover:bg-[#1a1a1a] data-[separator=active]:bg-blue-950/40 transition-colors'
      }
    >
      <div
        className={
          isVertical
            ? 'h-10 w-[2px] rounded-full bg-[#3a3a3a] group-hover:bg-[#555] group-data-[separator=active]:bg-blue-500/70 transition-colors'
            : 'w-10 h-[2px] rounded-full bg-[#3a3a3a] group-hover:bg-[#555] group-data-[separator=active]:bg-blue-500/70 transition-colors'
        }
      />
    </Separator>
  );
}
