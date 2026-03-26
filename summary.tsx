'use client';

import { Card } from '@/components/ui/card';
import { Users, CheckCircle, Car, CircleAlert, Wallet } from 'lucide-react';
import { formatCurrencyShort } from '@/lib/utils-currency';

interface SummaryGridProps {
  totalParticipants: number;
  eligibleCount: number;
  allocatedCount: number;
  totalContributed: number;
  outstandingBalance: number;
}

export function SummaryGrid({
  totalParticipants,
  eligibleCount,
  allocatedCount,
  totalContributed,
  outstandingBalance,
}: SummaryGridProps) {
  const items = [
    {
      label: 'Participants',
      value: totalParticipants.toString(),
      icon: Users,
      accent: 'text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'Total Pool',
      value: formatCurrencyShort(totalContributed),
      icon: Wallet,
      accent: 'text-green-600',
      iconBg: 'bg-green-100',
    },
    {
      label: 'Eligible',
      value: eligibleCount.toString(),
      icon: CheckCircle,
      accent: 'text-emerald-600',
      iconBg: 'bg-emerald-100',
    },
    {
      label: 'Cars Allocated',
      value: allocatedCount.toString(),
      icon: Car,
      accent: 'text-violet-600',
      iconBg: 'bg-violet-100',
    },
    {
      label: 'Outstanding',
      value: formatCurrencyShort(outstandingBalance),
      icon: CircleAlert,
      accent: 'text-orange-600',
      iconBg: 'bg-orange-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Card
            key={item.label}
            className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
          >
            <div className="mb-6 flex items-center gap-4">
              <div className={`rounded-2xl p-3 ${item.iconBg}`}>
                <Icon className={`h-5 w-5 ${item.accent}`} />
              </div>
              <p className="text-sm font-semibold text-slate-600">{item.label}</p>
            </div>
            <p className={`text-2xl font-bold tracking-tight ${item.accent}`}>{item.value}</p>
          </Card>
        );
      })}
    </div>
  );
}
