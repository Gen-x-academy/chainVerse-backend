'use client';

import { Card } from '@/components/ui/card';
import { StaffMember } from '@/types';
import { Car, Calendar } from 'lucide-react';
import { formatCurrency } from '@/lib/utils-currency';

interface AllocatedCarsProps {
  participants: StaffMember[];
}

export function AllocatedCars({ participants }: AllocatedCarsProps) {
  const allocatedParticipants = participants.filter(
    (p) => p.status === 'car-allocated' && p.allocatedCar
  );

  return (
    <Card className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <h2 className="text-xl font-bold text-slate-900">Cars Allocated</h2>
      <p className="mb-6 mt-1 text-sm text-slate-500">View allocated vehicles and remaining balance obligations.</p>

      {allocatedParticipants.length > 0 ? (
        <div className="space-y-4">
          {allocatedParticipants.map((participant) => {
            const car = participant.allocatedCar!;
            return (
              <div
                key={participant.id}
                className="flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-slate-50/70 p-5 transition-shadow hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-violet-100 p-3">
                    <Car className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{participant.name}</p>
                    <p className="text-sm text-slate-500">
                      {car.year} {car.make} {car.model} • {participant.employeeId}
                    </p>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3 md:text-center">
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-500">Allocation Date</p>
                    <p className="font-semibold text-slate-900">
                      {new Date(car.allocationDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-500">Outstanding Balance</p>
                    <p className="font-semibold text-orange-600">
                      {formatCurrency(Math.max(participant.targetAmount - participant.contributionAmount, 0))}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-500">Vehicle Details</p>
                    <p className="font-semibold text-slate-900">{car.color} • {car.licensePlate}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-600 shadow-sm">
                  <p className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                      Allocated
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-8 text-center text-slate-500">
          No cars allocated yet
        </div>
      )}
    </Card>
  );
}
