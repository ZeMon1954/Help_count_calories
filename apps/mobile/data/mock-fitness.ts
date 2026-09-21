export interface MockExercise {
  id: string;
  name: string;
  target: string;
  sets: number;
  reps: string;
  restSeconds: number;
  note: string;
}

export const MOCK_EXERCISES: MockExercise[] = [
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    target: 'ขาและสะโพก',
    sets: 4,
    reps: '10–12',
    restSeconds: 90,
    note: 'รักษาหลังให้ตรงและดันเข่าไปตามแนวปลายเท้า',
  },
  {
    id: 'dumbbell-press',
    name: 'Dumbbell Floor Press',
    target: 'อกและแขนหลัง',
    sets: 3,
    reps: '8–12',
    restSeconds: 75,
    note: 'ลดศอกอย่างควบคุมจนต้นแขนแตะพื้น',
  },
  {
    id: 'one-arm-row',
    name: 'One-arm Dumbbell Row',
    target: 'หลังและแขนหน้า',
    sets: 3,
    reps: 'ข้างละ 12',
    restSeconds: 60,
    note: 'ดึงศอกเข้าหาลำตัวและไม่บิดสะโพก',
  },
  {
    id: 'plank',
    name: 'Plank',
    target: 'แกนกลางลำตัว',
    sets: 3,
    reps: '40 วินาที',
    restSeconds: 45,
    note: 'เกร็งหน้าท้องและรักษาลำตัวเป็นเส้นตรง',
  },
];

export const MOCK_WEIGHT_HISTORY = [
  { label: '1 ก.ย.', weight: 72.4 },
  { label: '5 ก.ย.', weight: 72.0 },
  { label: '9 ก.ย.', weight: 71.8 },
  { label: '13 ก.ย.', weight: 71.3 },
  { label: '17 ก.ย.', weight: 71.1 },
  { label: 'วันนี้', weight: 70.8 },
];

export const MOCK_WORKOUT_HISTORY = [
  { date: '18 ก.ย.', title: 'Full Body A', duration: '48 นาที' },
  { date: '16 ก.ย.', title: 'เดินเร็ว', duration: '35 นาที' },
  { date: '14 ก.ย.', title: 'Full Body B', duration: '52 นาที' },
];
