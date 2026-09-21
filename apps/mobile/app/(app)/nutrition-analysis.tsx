import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ActionButton, Card, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import {
  analyzeNutrition,
  type NutritionActivity,
  type NutritionAnalysisResult,
  type NutritionGoal,
} from '@/services/api/nutrition-analysis';
import { saveNutritionTargets } from '@/services/api/settings';

const goalOptions: { value: NutritionGoal; label: string }[] = [
  { value: 'lose_fat', label: 'ลดไขมัน / ลีน' },
  { value: 'build_muscle', label: 'เพิ่มกล้ามเนื้อ' },
  { value: 'maintain', label: 'รักษาน้ำหนัก' },
];
const activityOptions: { value: NutritionActivity; label: string }[] = [
  { value: 'sedentary', label: 'นั่งทำงานเป็นหลัก' },
  { value: 'lightly_active', label: 'เคลื่อนไหวเล็กน้อย' },
  { value: 'moderately_active', label: 'เคลื่อนไหวปานกลาง' },
  { value: 'very_active', label: 'เคลื่อนไหวมาก' },
];

function Choice<T extends string>({ value, selected, label, onSelect }: {
  value: T; selected: T; label: string; onSelect: (value: T) => void;
}) {
  return <Pressable className={`min-h-12 justify-center rounded-xl border px-4 ${selected === value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`} onPress={() => onSelect(value)}>
    <Text className={selected === value ? 'font-semibold text-emerald-800' : 'text-slate-700'}>{label}</Text>
  </Pressable>;
}

export default function NutritionAnalysisScreen() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const initialAge = useMemo(() => {
    const birth = profile?.profile?.birthDate;
    return birth ? String(Math.max(13, new Date().getFullYear() - Number(birth.slice(0, 4)))) : '';
  }, [profile?.profile?.birthDate]);
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState(initialAge);
  const [weight, setWeight] = useState(profile?.latestMeasurement?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(profile?.profile?.heightCm?.toString() ?? '');
  const [activity, setActivity] = useState<NutritionActivity>(profile?.profile?.activityLevel ?? 'sedentary');
  const [goal, setGoal] = useState<NutritionGoal>(profile?.currentGoal?.goalType ?? 'maintain');
  const [result, setResult] = useState<NutritionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function analyze() {
    if (!session?.access_token || loading) return;
    const input = { age: Number(age), weight_kg: Number(weight), height_cm: Number(height) };
    if (!Number.isInteger(input.age) || input.age < 13 || input.age > 100 || input.weight_kg < 30 || input.height_cm < 100) {
      setError('กรุณากรอกอายุ น้ำหนัก และส่วนสูงให้ถูกต้อง');
      return;
    }
    setLoading(true); setError(''); setMessage('');
    try {
      setResult(await analyzeNutrition(session.access_token, { ...input, sex, activity_level: activity, goal }));
    } catch { setError('วิเคราะห์ไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่'); }
    finally { setLoading(false); }
  }

  async function useTargets() {
    if (!session?.access_token || !result || saving) return;
    setSaving(true); setError('');
    try {
      await saveNutritionTargets(session.access_token, {
        calories: result.calories, protein_g: result.protein_g,
        carbs_g: result.carbs_g, fat_g: result.fat_g,
      });
      setMessage('ใช้เป้าหมายโภชนาการนี้แล้ว หน้าแรกจะแสดงตัวเลขใหม่');
    } catch { setError('บันทึกเป้าหมายไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  const field = (label: string, value: string, onChangeText: (value: string) => void, suffix: string) => <View className="gap-1">
    <Text className="font-medium text-slate-700">{label}</Text>
    <View className="flex-row items-center rounded-xl border border-slate-300 bg-white px-3">
      <TextInput className="min-h-12 flex-1 text-slate-950" keyboardType="decimal-pad" value={value} onChangeText={onChangeText} />
      <Text className="text-slate-500">{suffix}</Text>
    </View>
  </View>;

  return <Screen title="AI วิเคราะห์โภชนาการ" subtitle="คำนวณจากร่างกาย กิจกรรม และเป้าหมายของคุณ">
    <Pressable className="min-h-11 justify-center" onPress={() => router.back()}><Text className="font-semibold text-emerald-700">← กลับ</Text></Pressable>
    <Card><View className="gap-3">
      <Text className="font-bold text-slate-950">ข้อมูลสำหรับคำนวณ</Text>
      <View className="flex-row gap-2">
        <View className="flex-1"><Choice value="male" selected={sex} label="ชาย" onSelect={setSex} /></View>
        <View className="flex-1"><Choice value="female" selected={sex} label="หญิง" onSelect={setSex} /></View>
      </View>
      {field('อายุ', age, setAge, 'ปี')}{field('น้ำหนัก', weight, setWeight, 'กก.')}{field('ส่วนสูง', height, setHeight, 'ซม.')}
      <Text className="mt-2 font-semibold text-slate-900">เป้าหมาย</Text>
      {goalOptions.map((item) => <Choice key={item.value} {...item} selected={goal} onSelect={setGoal} />)}
      <Text className="mt-2 font-semibold text-slate-900">กิจกรรมในชีวิตประจำวัน</Text>
      {activityOptions.map((item) => <Choice key={item.value} {...item} selected={activity} onSelect={setActivity} />)}
    </View></Card>
    <ActionButton label={loading ? 'AI กำลังวิเคราะห์...' : 'วิเคราะห์โภชนาการ'} disabled={loading} onPress={() => void analyze()} />
    {error ? <Text className="rounded-xl bg-red-50 p-3 text-red-700">{error}</Text> : null}
    {result ? <>
      <SectionHeader title="เป้าหมายที่แนะนำ" />
      <Card><View className="gap-3">
        <Text className="text-center text-4xl font-black text-emerald-700">{result.calories}</Text><Text className="text-center text-slate-500">kcal ต่อวัน</Text>
        <View className="flex-row justify-between"><Text>โปรตีน {result.protein_g} g</Text><Text>คาร์บ {result.carbs_g} g</Text><Text>ไขมัน {result.fat_g} g</Text></View>
        <View className="border-t border-slate-100 pt-3"><Text className="text-slate-600">BMR {result.bmr} · TDEE {result.tdee} kcal</Text></View>
        <Text className="leading-6 text-slate-700">{result.explanation}</Text>
        {result.tips.map((tip) => <Text key={tip} className="leading-5 text-slate-600">• {tip}</Text>)}
        <Text className="text-xs text-slate-400">{result.ai_generated ? 'คำอธิบายโดย AI · ตัวเลขคำนวณด้วยสูตรมาตรฐาน' : 'คำแนะนำมาตรฐาน · AI ไม่พร้อมใช้งานในครั้งนี้'}</Text>
      </View></Card>
      <ActionButton label={saving ? 'กำลังบันทึก...' : 'ใช้เป็นเป้าหมายประจำวัน'} disabled={saving} onPress={() => void useTargets()} />
    </> : null}
    {message ? <Text className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{message}</Text> : null}
  </Screen>;
}
