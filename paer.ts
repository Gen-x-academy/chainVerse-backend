import { StaffMember, TARGET_AMOUNT, User, StaffInvitation } from '@/types';

export const LOGIN_DOMAIN = 'panterrare.com';
export const ADMIN_EMAIL = `admin@${LOGIN_DOMAIN}`;
export const DEFAULT_LOGIN_PASSWORD = 'Panterrare#2026';

const departments = [
  'Finance',
  'Operations',
  'Engineering',
  'HR',
  'Procurement',
  'Compliance',
  'Support',
  'Admin',
  'Sales',
  'Marketing',
  'Strategy',
  'Technology',
];

const carAssignments = [
  { make: 'Toyota', model: 'Corolla', year: 2023, color: 'Silver' },
  { make: 'Hyundai', model: 'Elantra', year: 2022, color: 'White' },
];

const sampleProfiles = [
  { name: 'Tayo Odunsi', amount: 5000000, status: 'eligible' as const, queuePosition: 1 },
  { name: 'Ayo Ibaru', amount: 2250000, status: 'in-progress' as const },
  { name: 'Tunde Ojecrinde', amount: 1600000, status: 'in-progress' as const },
  { name: 'Victoria Abah', amount: 4850000, status: 'eligible' as const, queuePosition: 2 },
  { name: 'Fareedah Alaka', amount: 750000, status: 'not-eligible' as const },
  { name: 'Rasaq Odejayi', amount: 3900000, status: 'in-progress' as const },
  { name: 'Hassan Oladipupo', amount: 4700000, status: 'eligible' as const, queuePosition: 3 },
  { name: 'Ahmed Faruq', amount: 5000000, status: 'car-allocated' as const },
  { name: 'Dami Kaffo', amount: 4400000, status: 'in-progress' as const },
  { name: 'Akin Mudashiru', amount: 400000, status: 'not-eligible' as const },
  { name: 'Stephen Yunana', amount: 3200000, status: 'in-progress' as const },
  { name: 'Temiloluwa Ibrahim', amount: 5000000, status: 'car-allocated' as const },
];

const toEmail = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@${LOGIN_DOMAIN}`;

const buildDeductions = (staffIndex: number, amount: number) => {
  const monthlyBase = 250000;
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  if (amount <= 0) return [];

  const fullMonths = Math.floor(amount / monthlyBase);
  const remainder = amount % monthlyBase;
  const months = remainder > 0 ? fullMonths + 1 : fullMonths;
  const startMonth = 11 - (months % 6);
  const startYear = 2024 - Math.floor(months / 14);

  return Array.from({ length: months }, (_, deductionIndex) => {
    const currentMonthIndex = (startMonth + deductionIndex) % 12;
    const currentYear = startYear + Math.floor((startMonth + deductionIndex) / 12);
    const isLast = deductionIndex === months - 1;
    const deductionAmount = isLast && remainder > 0 ? remainder : monthlyBase;

    return {
      id: `${staffIndex + 1}-${deductionIndex + 1}`,
      date: `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-15`,
      amount: deductionAmount,
      month: monthNames[currentMonthIndex],
    };
  });
};

export const mockStaff: StaffMember[] = sampleProfiles.map((profile, index) => {
  const id = String(index + 1);
  const email = toEmail(profile.name);
  const deductions = buildDeductions(index, profile.amount);
  const allocatedCar =
    profile.status === 'car-allocated'
      ? {
          id: `CAR${String(index + 1).padStart(3, '0')}`,
          ...carAssignments[index % carAssignments.length],
          licensePlate: `ABJ-${String(index + 1).padStart(3, '0')}`,
          allocationDate: `2025-${String((index % 9) + 1).padStart(2, '0')}-12`,
        }
      : undefined;

  return {
    id,
    userId: `user${id}`,
    name: profile.name,
    employeeId: `EMP${String(index + 1).padStart(3, '0')}`,
    department: departments[index % departments.length],
    email,
    joinDate: `202${index % 5}-0${(index % 8) + 1}-10`,
    contributionAmount: profile.amount,
    targetAmount: TARGET_AMOUNT,
    status: profile.status,
    queuePosition: profile.queuePosition,
    allocatedCar,
    createdAt: `202${index % 5}-0${(index % 8) + 1}-10`,
    deductions,
  };
});

export const mockUsers: User[] = [
  ...mockStaff.map((staff) => ({
    id: staff.userId,
    email: staff.email,
    password: DEFAULT_LOGIN_PASSWORD,
    name: staff.name,
    role: 'staff' as const,
    createdAt: staff.createdAt,
  })),
  {
    id: 'admin1',
    email: ADMIN_EMAIL,
    password: DEFAULT_LOGIN_PASSWORD,
    name: 'Panterrare Admin',
    role: 'admin',
    createdAt: '2020-01-01',
  },
];

export const mockInvitations: StaffInvitation[] = [
  ...mockStaff.slice(0, 5).map((staff, index) => ({
    id: `inv${index + 1}`,
    email: staff.email,
    invitedBy: 'admin1',
    status: 'accepted' as const,
    invitedAt: `2025-0${index + 1}-03`,
    monthlyDeduction: 250000,
    acceptedAt: `2025-0${index + 1}-07`,
  })),
  {
    id: 'inv-pending',
    email: `new.joiner@${LOGIN_DOMAIN}`,
    invitedBy: 'admin1',
    status: 'pending',
    invitedAt: '2026-03-20',
    monthlyDeduction: 200000,
  },
];

const toDisplayName = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const getStaffByEmail = (email?: string | null) =>
  mockStaff.find((staff) => staff.email.toLowerCase() === email?.toLowerCase());

export const getStaffForEmail = (email?: string | null): StaffMember => {
  const matchedStaff = getStaffByEmail(email);

  if (matchedStaff) {
    return matchedStaff;
  }

  const fallback = mockStaff.find((staff) => staff.queuePosition === 3) ?? mockStaff[0];

  if (!email) {
    return fallback;
  }

  return {
    ...fallback,
    id: `${fallback.id}-guest`,
    userId: `${fallback.userId}-guest`,
    name: toDisplayName(email),
    email,
  };
};
