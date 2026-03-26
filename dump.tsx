'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { StaffMember } from '@/types';
import { StatusBadge } from '@/components/shared/status-badge';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils-currency';

interface ParticipantsTableProps {
  participants: StaffMember[];
}

type SortField = 'name' | 'contribution' | 'status';
type SortOrder = 'asc' | 'desc';

export function ParticipantsTable({ participants }: ParticipantsTableProps) {
  const [sortField, setSortField] = useState<SortField>('contribution');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedParticipants = [...participants].sort((a, b) => {
    let aValue: any = a.name;
    let bValue: any = b.name;

    if (sortField === 'contribution') {
      aValue = a.contributionAmount;
      bValue = b.contributionAmount;
    } else if (sortField === 'status') {
      aValue = a.status;
      bValue = b.status;
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  return (
    <Card className="overflow-hidden rounded-[28px] border border-white/70 bg-white/95 p-0 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-xl font-bold text-slate-900">All Participants</h2>
        <p className="mt-1 text-sm text-slate-500">Track contribution progress and allocation readiness across staff.</p>
      </div>

      <div className="overflow-x-auto px-2 py-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th
                className="rounded-xl text-left py-4 px-4 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('name')}
              >
                Name <SortIcon field="name" />
              </th>
              <th className="text-left py-4 px-4 font-semibold text-slate-500">Employee ID</th>
              <th className="text-left py-4 px-4 font-semibold text-slate-500">Department</th>
              <th
                className="text-right py-4 px-4 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('contribution')}
              >
                Contributed <SortIcon field="contribution" />
              </th>
              <th className="text-center py-4 px-4 font-semibold text-slate-500">Progress</th>
              <th
                className="text-center py-4 px-4 font-semibold text-slate-500 cursor-pointer hover:bg-slate-50"
                onClick={() => handleSort('status')}
              >
                Status <SortIcon field="status" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedParticipants.map((participant) => {
              const progress = (participant.contributionAmount / participant.targetAmount) * 100;
              return (
                <tr
                  key={participant.id}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50/80"
                >
                  <td className="py-4 px-4 font-semibold text-slate-900">{participant.name}</td>
                  <td className="py-4 px-4 text-xs font-mono text-slate-500">{participant.employeeId}</td>
                  <td className="py-4 px-4 text-sm text-slate-700">{participant.department}</td>
                  <td className="py-4 px-4 text-right font-semibold text-slate-900">
                    {formatCurrency(participant.contributionAmount)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2 max-w-xs flex-1 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-slate-600">{Math.round(progress)}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <StatusBadge status={participant.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedParticipants.length === 0 && (
        <div className="px-6 py-10 text-center text-slate-500">
          No participants found
        </div>
      )}
    </Card>
  );
}
