import { Dimensions, Text, View } from 'react-native';
import { LineChart, ProgressChart } from 'react-native-chart-kit';

import { Card, ProgressBar } from '@/components/ui/Kit';
import { paceOptions, type WeightPlanSummary } from '@/services/api/weight-plan';

const kcal = (value: number) => Math.round(value).toLocaleString('th-TH');

const statusStyle = {
  within: {
    ring: '#10b981',
    text: 'text-emerald-700',
    label: (remaining: number) => `เหลืองบอีก ${kcal(remaining)} kcal`,
  },
  slightly_over: {
    ring: '#f59e0b',
    text: 'text-amber-700',
    label: (remaining: number) => `เกินงบเล็กน้อย ${kcal(-remaining)} kcal`,
  },
  over: {
    ring: '#ef4444',
    text: 'text-red-700',
    label: (remaining: number) => `เกินงบ ${kcal(-remaining)} kcal`,
  },
} as const;

export function TodayCard({ summary }: { summary: WeightPlanSummary }) {
  const { today } = summary;
  const style = statusStyle[today.status];
  const ratio = today.budget > 0 ? today.consumed / today.budget : 0;
  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <View className="items-center justify-center">
          <ProgressChart
            data={[Math.min(1, Math.max(0.001, ratio))]}
            width={120}
            height={120}
            strokeWidth={14}
            radius={44}
            chartConfig={{
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              color: (opacity = 1) =>
                style.ring +
                Math.round(opacity * 255)
                  .toString(16)
                  .padStart(2, '0'),
            }}
            hideLegend
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-slate-500">
            วันนี้กินไปแล้ว
          </Text>
          <Text className="text-3xl font-black text-slate-950">
            {kcal(today.consumed)}
            <Text className="text-base font-semibold text-slate-400">
              {' '}
              / {kcal(today.budget)} kcal
            </Text>
          </Text>
          <Text className={`mt-1 font-bold ${style.text}`}>
            {style.label(today.remaining)}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row rounded-2xl bg-slate-50 p-3">
        <View className="flex-1">
          <Text className="text-xs text-slate-500">เผาผลาญวันนี้</Text>
          <Text className="font-bold text-slate-900">{kcal(today.burn)} kcal</Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-slate-500">ออกกำลังกาย</Text>
          <Text className="font-bold text-sky-700">
            +{kcal(today.exerciseCalories)} kcal
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-slate-500">ขาดตอนนี้</Text>
          <Text className="font-bold text-emerald-700">
            {kcal(today.deficitIfStopNow)} kcal
          </Text>
        </View>
      </View>
    </Card>
  );
}

export function ZoneCard({ summary }: { summary: WeightPlanSummary }) {
  const { zone, today, targetDeficit } = summary;
  const scaleMax = Math.max(zone.maxDeficit + 250, 1);
  const pct = (value: number) => Math.min(100, Math.max(0, (value / scaleMax) * 100));
  const marker = pct(today.deficitIfStopNow);
  const paceLabel = paceOptions.find((option) => option.value === summary.pace);
  return (
    <Card>
      <Text className="font-bold text-slate-950">โซนขาดที่พอดีสำหรับคุณ</Text>
      <Text className="mt-1 text-sm leading-5 text-slate-500">
        ขาดวันละ {kcal(zone.minDeficit)}–{kcal(zone.maxDeficit)} kcal
        (เป้า {kcal(targetDeficit)}) ≈ {paceLabel?.detail ?? ''}
      </Text>
      <View className="mt-5 h-3 rounded-full bg-slate-100">
        <View
          className="absolute h-3 rounded-full bg-emerald-300"
          style={{
            left: `${pct(zone.minDeficit)}%`,
            width: `${pct(zone.maxDeficit) - pct(zone.minDeficit)}%`,
          }}
        />
        <View
          className="absolute -top-1 h-5 w-1.5 rounded-full bg-slate-900"
          style={{ left: `${marker}%` }}
        />
      </View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-xs text-slate-400">ขาด 0</Text>
        <Text className="text-xs text-slate-400">{kcal(scaleMax)}</Text>
      </View>
      <Text className="mt-2 text-xs leading-4 text-slate-500">
        แท่งดำ = ถ้าหยุดกินตอนนี้ วันนี้จะขาด {kcal(today.deficitIfStopNow)} kcal
      </Text>
      {summary.safetyAdjusted ? (
        <Text className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          ความเร็วที่เลือกทำให้ต้องกินต่ำกว่า BMR ({kcal(summary.bmr)} kcal)
          ระบบจึงปรับโซนลงเพื่อความปลอดภัย
        </Text>
      ) : null}
    </Card>
  );
}

export function GoalCard({ summary }: { summary: WeightPlanSummary }) {
  const { goal } = summary;
  const reached = goal.remainingKg <= 0;
  return (
    <Card>
      <Text className="font-bold text-slate-950">เป้าน้ำหนัก</Text>
      <View className="mt-3 flex-row items-end justify-between">
        <Text className="text-3xl font-black text-slate-950">
          {goal.currentWeightKg}
          <Text className="text-base font-semibold text-slate-400"> กก.</Text>
        </Text>
        <Text className="text-sm text-slate-500">
          เป้า {goal.targetWeightKg} กก.
        </Text>
      </View>
      <View className="mt-3">
        <ProgressBar value={goal.progressPercent} color="bg-emerald-500" />
      </View>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-xs text-slate-500">เริ่ม {goal.startWeightKg} กก.</Text>
        <Text className="text-xs font-bold text-emerald-700">
          {goal.progressPercent}%
        </Text>
      </View>
      <Text className="mt-3 text-sm leading-5 text-slate-700">
        {reached
          ? 'ถึงน้ำหนักเป้าหมายแล้ว 🎉'
          : goal.estimatedDate
            ? `เหลืออีก ${goal.remainingKg} กก. คาดว่าจะถึงเป้าประมาณ ${new Date(`${goal.estimatedDate}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ถ้าทำตามโซนทุกวัน`
            : `เหลืออีก ${goal.remainingKg} กก.`}
      </Text>
    </Card>
  );
}

export function ProjectionCard({ summary }: { summary: WeightPlanSummary }) {
  const { projection } = summary;
  const series = projection.series.slice(-7);
  return (
    <Card>
      <Text className="font-bold text-slate-950">คาดการณ์น้ำหนักรายวัน</Text>
      {projection.daysTracked === 0 ? (
        <Text className="mt-2 text-sm leading-5 text-slate-500">
          บันทึกอาหารอย่างน้อย 1 วันเพื่อดูว่าน่าจะลดไปแล้วเท่าไหร่
        </Text>
      ) : (
        <>
          <Text className="mt-2 text-sm leading-5 text-slate-600">
            จากยอดขาดสะสม {projection.daysTracked} วันที่บันทึก น่าจะลดไปแล้วประมาณ{' '}
            <Text className="font-bold text-emerald-700">
              {projection.estimatedLossKg} กก.
            </Text>{' '}
            (ประมาณการ ไม่ใช่น้ำหนักที่ชั่งจริง)
          </Text>
          {series.length >= 2 ? (
            <LineChart
              data={{
                labels: series.map((point) =>
                  new Date(`${point.date}T12:00:00`).toLocaleDateString('th-TH', {
                    day: 'numeric',
                    month: 'short',
                  }),
                ),
                datasets: [
                  {
                    data: series.map((point) => point.estimatedKg),
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                  },
                  {
                    data: series.map((point) => point.actualKg),
                    color: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                  },
                ],
                legend: ['ประมาณการ', 'ชั่งจริง'],
              }}
              width={Math.min(Dimensions.get('window').width - 64, 600)}
              height={200}
              yAxisSuffix=" kg"
              chartConfig={{
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 1,
                color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                propsForDots: { r: '4' },
              }}
              bezier
              style={{ marginVertical: 8, borderRadius: 16, paddingRight: 32 }}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
