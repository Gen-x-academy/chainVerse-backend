'use client';

import { Card } from '@/components/ui/card';
import { AllocationQueueEntry } from '@/types';
import { Award, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils-currency';

interface AllocationQueueProps {
  queueEntries: AllocationQueueEntry[];
}

export function AllocationQueue({ queueEntries }: AllocationQueueProps) {
  const sortedQueue = [...queueEntries].sort((a, b) => a.queuePosition - b.queuePosition);

  return (
    <Card className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <h2 className="text-xl font-bold text-slate-900">Eligible Users</h2>
      <p className="mb-6 mt-1 text-sm text-slate-500">Ranked by contribution level and readiness for allocation.</p>

      <div className="space-y-3">
        {sortedQueue.map((entry, index) => {
          const isTop = index === 0;
          return (
            <div
              key={entry.staffId}
              className={`flex flex-col gap-4 rounded-[24px] border p-5 transition-all md:flex-row md:items-center ${
                isTop
                  ? 'border-emerald-200 bg-emerald-50/80 shadow-[0_8px_20px_rgba(16,185,129,0.10)]'
                  : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
              }`}
            >
              <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                isTop
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-white text-slate-600'
              }`}>
                #{entry.queuePosition}
              </div>

              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold text-slate-900">{entry.name}</p>
                <p className="text-sm text-slate-500">{entry.employeeId}</p>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all"
                      style={{ width: `${entry.contributionPercentage}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-600">
                    {Math.round(entry.contributionPercentage)}%
                  </span>
                </div>
              </div>

              <div className="flex-shrink-0 text-left md:text-right">
                <p className="font-semibold text-slate-900">{formatCurrency(entry.contributionAmount)}</p>
                <p className="text-xs text-slate-500">of {formatCurrency(entry.targetAmount)}</p>
              </div>

              {isTop && (
                <div className="flex-shrink-0">
                  <Award className="h-5 w-5 text-emerald-600" />
                </div>
              )}
              {!isTop && (
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400" />
              )}
            </div>
          );
        })}
      </div>

      {sortedQueue.length === 0 && (
        <div className="py-8 text-center text-slate-500">
          No participants in allocation queue
        </div>
      )}
    </Card>
  );
}
