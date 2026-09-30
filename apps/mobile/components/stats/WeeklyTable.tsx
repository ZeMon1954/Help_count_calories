import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/ui/Kit';
import type {
  DayStatus,
  MealType,
  ReportDay,
  WeekReport,
} from '@/services/api/weekly-report';

const kcal = (value: number) => Math.round(value).toLocaleString('th-TH');
const weekdayNames = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสฯ', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const mealLabels: Record<MealType, string> = {
  breakfast: 'เช้า',
  lunch: 'กลางวัน',
  dinner: 'เย็น',
  snack: 'ของว่าง',
};
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
  });

const statusView: Record<
  DayStatus,
  { label: string; badge: string; text: string } | null
> = {
  in_zone: { label: 'ผ่านเป้า', badge: 'bg-emerald-100', text: 'text-emerald-800' },
  over_budget: { label: 'กินเกิน', badge: 'bg-red-100', text: 'text-red-800' },
  too_low: { label: 'กินน้อยไป', badge: 'bg-amber-100', text: 'text-amber-800' },
  today: { label: 'วันนี้', badge: 'bg-sky-100', text: 'text-sky-800' },
  no_data: { label: 'ไม่ได้บันทึก', badge: 'bg-slate-100', text: 'text-slate-500' },
  no_plan: null,
  future: null,
};

function DayRow({ day }: { day: ReportDay }) {
  const view = statusView[day.status];
  const isFuture = day.status === 'future';
  return (
    <View
      className={`border-t border-slate-100 py-3 ${isFuture ? 'opacity-40' : ''}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-bold text-slate-900">
            {weekdayNames[day.weekday]}{' '}
            <Text className="text-xs font-normal text-slate-400">
              {shortDate(day.date)}
            </Text>
          </Text>
        </View>
        {view ? (
          <View className={`rounded-full px-2.5 py-1 ${view.badge}`}>
            <Text className={`text-xs font-bold ${view.text}`}>{view.label}</Text>
          </View>
        ) : null}
      </View>

      {day.meals.length ? (
        <View className="mt-2 gap-1">
          {day.meals.map((meal, index) => (
            <View key={`${meal.name}-${index}`} className="flex-row gap-2">
              <Text className="w-16 text-xs text-slate-400">
                {mealLabels[meal.mealType]}
              </Text>
              <Text className="min-w-0 flex-1 text-sm text-slate-700">
                {meal.name}
              </Text>
              <Text className="text-sm text-slate-500">{kcal(meal.calories)}</Text>
            </View>
          ))}
        </View>
      ) : !isFuture && day.status !== 'today' ? (
        <Text className="mt-1 text-xs text-slate-400">ไม่มีบันทึกอาหาร</Text>
      ) : null}

      {day.meals.length || day.exerciseCalories ? (
        <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2">
          <Text className="text-xs text-slate-500">
            กินรวม{' '}
            <Text className="font-bold text-slate-900">{kcal(day.consumed)}</Text>
          </Text>
          {day.budget !== null ? (
            <Text className="text-xs text-slate-500">
              งบ{' '}
              <Text className="font-bold text-slate-900">{kcal(day.budget)}</Text>
            </Text>
          ) : null}
          {day.exerciseCalories ? (
            <Text className="text-xs text-slate-500">
              ออกกำลัง{' '}
              <Text className="font-bold text-sky-700">
                +{kcal(day.exerciseCalories)}
              </Text>
            </Text>
          ) : null}
          {day.deficit !== null && day.status !== 'today' ? (
            <Text className="text-xs text-slate-500">
              {day.deficit >= 0 ? 'ขาด' : 'เกิน'}{' '}
              <Text
                className={`font-bold ${day.deficit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
              >
                {kcal(Math.abs(day.deficit))}
              </Text>
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function WeekSummary({ week, hasPlan }: { week: WeekReport; hasPlan: boolean }) {
  const { summary } = week;
  const cell = (label: string, value: string, tone = 'text-slate-900') => (
    <View className="w-1/2 py-2 pr-2">
      <Text className="text-xs text-slate-500">{label}</Text>
      <Text className={`text-base font-bold ${tone}`}>{value}</Text>
    </View>
  );
  return (
    <View className="mt-3 rounded-2xl bg-emerald-50 p-4">
      <Text className="font-bold text-emerald-900">สรุปสัปดาห์นี้</Text>
      <View className="mt-1 flex-row flex-wrap">
        {cell('บันทึกอาหาร', `${summary.daysLogged}/7 วัน`)}
        {cell(
          'กินเฉลี่ยต่อวัน',
          summary.averageConsumed === null ? '-' : `${kcal(summary.averageConsumed)} kcal`,
        )}
        {hasPlan
          ? cell(
              'ผ่านเป้า',
              `${summary.daysInZone}/${summary.daysCounted || 0} วัน`,
              'text-emerald-700',
            )
          : null}
        {hasPlan
          ? cell(
              'ขาดสะสม',
              summary.totalDeficit === null ? '-' : `${kcal(summary.totalDeficit)} kcal`,
              'text-emerald-700',
            )
          : null}
        {hasPlan
          ? cell(
              'น่าจะลดไป',
              summary.estimatedLossKg === null ? '-' : `${summary.estimatedLossKg} กก.`,
              'text-emerald-700',
            )
          : null}
        {cell('ออกกำลังกาย', `${kcal(summary.exerciseCalories)} kcal`, 'text-sky-700')}
        {summary.weightChangeKg !== null
          ? cell(
              'น้ำหนักที่ชั่งจริง',
              `${summary.weightChangeKg > 0 ? '+' : ''}${summary.weightChangeKg} กก.`,
            )
          : null}
      </View>
      {!hasPlan ? (
        <Text className="mt-1 text-xs leading-4 text-slate-500">
          ตั้งแผนลดน้ำหนักเพื่อดูว่าแต่ละวันผ่านเป้าหรือไม่
        </Text>
      ) : null}
    </View>
  );
}

function PastWeek({ week, hasPlan }: { week: WeekReport; hasPlan: boolean }) {
  const [open, setOpen] = useState(false);
  const { summary } = week;
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
      >
        <View className="flex-row items-center justify-between gap-2">
          <Text className="font-bold text-slate-900">
            {shortDate(week.weekStart)} – {shortDate(week.weekEnd)}
          </Text>
          <Text className="text-sm font-semibold text-emerald-700">
            {open ? 'ซ่อน' : 'ดูรายวัน'}
          </Text>
        </View>
        <Text className="mt-1 text-sm text-slate-500">
          บันทึก {summary.daysLogged}/7 วัน
          {summary.averageConsumed !== null
            ? ` · เฉลี่ย ${kcal(summary.averageConsumed)} kcal`
            : ''}
          {hasPlan && summary.daysCounted
            ? ` · ผ่านเป้า ${summary.daysInZone}/${summary.daysCounted}`
            : ''}
        </Text>
        {summary.estimatedLossKg !== null ? (
          <Text className="mt-0.5 text-sm text-emerald-700">
            ขาดสะสม {kcal(summary.totalDeficit ?? 0)} kcal · น่าจะลด{' '}
            {summary.estimatedLossKg} กก.
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View className="mt-2">
          {week.days.map((day) => (
            <DayRow key={day.date} day={day} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function WeeklyTable({
  weeks,
  hasPlan,
}: {
  weeks: WeekReport[];
  hasPlan: boolean;
}) {
  const current = weeks.find((week) => week.isCurrent);
  const past = weeks.filter((week) => !week.isCurrent);
  return (
    <View className="gap-4">
      {current ? (
        <Card>
          <Text className="text-lg font-extrabold text-slate-950">
            สัปดาห์นี้
          </Text>
          <Text className="text-sm text-slate-500">
            {shortDate(current.weekStart)} – {shortDate(current.weekEnd)}
          </Text>
          <View className="mt-2">
            {current.days.map((day) => (
              <DayRow key={day.date} day={day} />
            ))}
          </View>
          <WeekSummary week={current} hasPlan={hasPlan} />
        </Card>
      ) : null}
      {past.length ? (
        <>
          <Text className="text-lg font-extrabold text-slate-950">
            สัปดาห์ก่อนหน้า
          </Text>
          {past.map((week) => (
            <PastWeek key={week.weekStart} week={week} hasPlan={hasPlan} />
          ))}
        </>
      ) : null}
    </View>
  );
}
