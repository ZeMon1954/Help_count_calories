import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ActionButton, Card } from '@/components/ui/Kit';
import {
  paceOptions,
  type Pace,
  type Sex,
  type WeightPlan,
  type WeightPlanInput,
} from '@/services/api/weight-plan';

interface Props {
  plan: WeightPlan | null;
  currentWeightKg: number | null;
  saving: boolean;
  onSave: (input: WeightPlanInput) => void;
  onCancel?: () => void;
}

function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-2 py-2 ${selected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white'}`}
    >
      <Text
        className={selected ? 'font-bold text-emerald-800' : 'text-slate-700'}
      >
        {label}
      </Text>
      {detail ? (
        <Text className="mt-0.5 text-[11px] text-slate-500">{detail}</Text>
      ) : null}
    </Pressable>
  );
}

export function PlanSetupCard({
  plan,
  currentWeightKg,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [sex, setSex] = useState<Sex>(plan?.sex ?? 'male');
  const [pace, setPace] = useState<Pace>(plan?.pace ?? 'normal');
  const [target, setTarget] = useState(
    plan ? String(plan.targetWeightKg) : '',
  );
  const [error, setError] = useState('');

  function submit() {
    const value = Number(target);
    if (!Number.isFinite(value) || value < 30 || value > 500) {
      setError('กรุณาระบุน้ำหนักเป้าหมายระหว่าง 30–500 กก.');
      return;
    }
    if (currentWeightKg !== null && value >= currentWeightKg) {
      setError('น้ำหนักเป้าหมายต้องต่ำกว่าน้ำหนักปัจจุบัน');
      return;
    }
    setError('');
    onSave({ sex, targetWeightKg: value, pace });
  }

  return (
    <Card>
      <Text className="text-lg font-extrabold text-slate-950">
        {plan ? 'ปรับแผนลดน้ำหนัก' : 'ตั้งเป้าหมายลดน้ำหนัก'}
      </Text>
      <Text className="mt-1 text-sm leading-5 text-slate-500">
        ระบบจะคำนวณงบแคลอรีรายวันจากอายุ ส่วนสูง น้ำหนัก และเพศของคุณ
        {currentWeightKg !== null
          ? ` (น้ำหนักตอนนี้ ${currentWeightKg} กก.)`
          : ''}
      </Text>

      <Text className="mt-4 font-bold text-slate-900">เพศ</Text>
      <View className="mt-2 flex-row gap-2">
        <Choice
          label="ชาย"
          selected={sex === 'male'}
          onPress={() => setSex('male')}
        />
        <Choice
          label="หญิง"
          selected={sex === 'female'}
          onPress={() => setSex('female')}
        />
      </View>

      <Text className="mt-4 font-bold text-slate-900">น้ำหนักเป้าหมาย (กก.)</Text>
      <TextInput
        accessibilityLabel="น้ำหนักเป้าหมายกิโลกรัม"
        className="mt-2 min-h-12 rounded-xl border border-slate-300 px-3 text-slate-900"
        keyboardType="decimal-pad"
        placeholder="เช่น 65"
        value={target}
        onChangeText={setTarget}
      />

      <Text className="mt-4 font-bold text-slate-900">ความเร็วที่ต้องการ</Text>
      <View className="mt-2 flex-row gap-2">
        {paceOptions.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            detail={option.detail}
            selected={pace === option.value}
            onPress={() => setPace(option.value)}
          />
        ))}
      </View>

      {error ? (
        <Text className="mt-3 rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </Text>
      ) : null}
      <View className="mt-5 gap-3">
        <ActionButton
          label={saving ? 'กำลังบันทึก...' : 'บันทึกแผน'}
          disabled={saving}
          onPress={submit}
        />
        {onCancel ? (
          <ActionButton
            label="ยกเลิก"
            variant="secondary"
            disabled={saving}
            onPress={onCancel}
          />
        ) : null}
      </View>
      <Text className="mt-3 text-xs leading-4 text-slate-400">
        ตัวเลขเป็นค่าประมาณจากสูตรมาตรฐาน ไม่ใช่คำแนะนำทางการแพทย์
        รองรับผู้ใหญ่อายุ 18 ปีขึ้นไป
      </Text>
    </Card>
  );
}
