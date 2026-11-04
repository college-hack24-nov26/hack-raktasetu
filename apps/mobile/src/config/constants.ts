export interface DistrictOption {
  code: number;
  name: string;
}

export const MAHARASHTRA_DISTRICTS: DistrictOption[] = [
  { code: 521, name: 'Pune' },
  { code: 519, name: 'Mumbai' },
  { code: 516, name: 'Nashik' },
  { code: 505, name: 'Nagpur' },
  { code: 515, name: 'Chhatrapati Sambhajinagar' },
  { code: 526, name: 'Solapur' },
  { code: 530, name: 'Kolhapur' },
  { code: 531, name: 'Sangli' },
  { code: 527, name: 'Satara' },
  { code: 522, name: 'Ahmednagar / Ahilyanagar' },
  { code: 503, name: 'Amravati' },
  { code: 524, name: 'Latur' },
  { code: 501, name: 'Akola' },
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodGroupDisplay = typeof BLOOD_GROUPS[number];

export const BLOOD_GROUP_TO_ENUM: Record<string, string> = {
  'A+': 'A_POS',
  'A-': 'A_NEG',
  'B+': 'B_POS',
  'B-': 'B_NEG',
  'AB+': 'AB_POS',
  'AB-': 'AB_NEG',
  'O+': 'O_POS',
  'O-': 'O_NEG',
};

export const ENUM_TO_BLOOD_GROUP: Record<string, string> = {
  'A_POS': 'A+',
  'A_NEG': 'A-',
  'B_POS': 'B+',
  'B_NEG': 'B-',
  'AB_POS': 'AB+',
  'AB_NEG': 'AB-',
  'O_POS': 'O+',
  'O_NEG': 'O-',
};

export function displayBloodGroup(raw?: string | null): string {
  if (!raw) return '—';
  return ENUM_TO_BLOOD_GROUP[raw] || raw.replace('_POS', '+').replace('_NEG', '-');
}

export function toBloodGroupEnum(display?: string | null): string {
  if (!display) return 'O_POS';
  return BLOOD_GROUP_TO_ENUM[display] || display;
}

export const BLOOD_COMPONENTS = [
  'Packed Red Blood Cells',
  'Whole Blood',
  'Platelet Concentrate',
  'Fresh Frozen Plasma',
] as const;

