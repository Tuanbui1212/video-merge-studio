'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';

export interface TourStep {
  target?: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  onEnter?: () => void;
}

interface InteractiveTourProps {
  active: boolean;
  onClose: () => void;
  steps: TourStep[];
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 10;

function getTooltipPosition(
  rect: Rect | null,
  placement: TourStep['placement'],
  tooltipW: number,
  tooltipH: number
) {
  if (!rect || placement === 'center') {
    return {
      top: window.innerHeight / 2 - tooltipH / 2,
      left: window.innerWidth / 2 - tooltipW / 2,
    };
  }

  const gap = 16;
  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = rect.top + rect.height + gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - tooltipH - gap;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - tooltipW - gap;
      break;
    case 'right':
    default:
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left + rect.width + gap;
      break;
  }

  top = Math.max(12, Math.min(top, window.innerHeight - tooltipH - 12));
  left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));
  return { top, left };
}

export default function InteractiveTour({ active, onClose, steps }: InteractiveTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  const measureTarget = useCallback(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!active) {
      setStepIndex(0);
      setTargetRect(null);
      return;
    }
    step?.onEnter?.();
    const t1 = setTimeout(measureTarget, 50);
    const t2 = setTimeout(measureTarget, 300);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [active, stepIndex, step, measureTarget, active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && !isLast) setStepIndex((i) => i + 1);
      if (e.key === 'ArrowLeft' && !isFirst) setStepIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, isFirst, isLast, onClose]);

  if (!active || !step) return null;

  const placement = step.placement ?? (step.target ? 'right' : 'center');
  const tooltipPos = getTooltipPosition(targetRect, placement, 320, 200);

  return (
    <div className="fixed inset-0 z-[300]">
      {/* Spotlight */}
      {targetRect ? (
        <div
          className="fixed rounded-lg pointer-events-none tour-spotlight"
          style={{
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.82)',
            border: '2px solid #3b82f6',
            zIndex: 301,
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/82 z-[301]" />
      )}

      {/* Tooltip */}
      <div
        className="fixed z-[302] w-80 rounded-xl border border-blue-500/40 bg-[#141414] shadow-2xl shadow-blue-900/30 p-4"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-mono text-blue-400">
              Bước {stepIndex + 1}/{steps.length}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
        <p className="text-xs text-gray-400 leading-relaxed whitespace-pre-line">{step.body}</p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#282828]">
          <button
            onClick={onClose}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Bỏ qua
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={() => setStepIndex((i) => i - 1)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-[#282828] hover:bg-[#383838] text-gray-300 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Trước
              </button>
            )}
            <button
              onClick={() => (isLast ? onClose() : setStepIndex((i) => i + 1))}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
            >
              {isLast ? 'Hoàn thành' : 'Tiếp theo'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? 'w-4 bg-blue-500' : 'w-1.5 bg-gray-600'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
