import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth/AuthField';
import { ProfileStateScreen } from '@/components/profile/ProfileStateScreen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import type {
  ActivityLevel,
  Equipment,
  ExperienceLevel,
  GoalType,
  TrainingLocation,
} from '@/services/api/profile';

const goals: { value: GoalType; label: string }[] = [
  { value: 'lose_fat', label: 'ลดไขมัน' },
  { value: 'build_muscle', label: 'เพิ่มกล้ามเนื้อ' },
  { value: 'maintain', label: 'รักษาน้ำหนัก' },
];
const activities: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'ไม่ค่อยเคลื่อนไหว' },
  { value: 'lightly_active', label: 'เคลื่อนไหวเล็กน้อย' },
  { value: 'moderately_active', label: 'เคลื่อนไหวปานกลาง' },
  { value: 'very_active', label: 'เคลื่อนไหวมาก' },
];
const locations: { value: TrainingLocation; label: string }[] = [
  { value: 'home', label: 'ที่บ้าน' },
  { value: 'gym', label: 'ฟิตเนส' },
  { value: 'both', label: 'ทั้งสองที่' },
];
const experiences: { value: ExperienceLevel; label: string }[] = [
  { value: 'beginner', label: 'เริ่มต้น' },
  { value: 'intermediate', label: 'ปานกลาง' },
  { value: 'advanced', label: 'ขั้นสูง' },
];
const equipmentOptions: { value: Equipment; label: string }[] = [
  { value: 'bodyweight', label: 'น้ำหนักตัว' },
  { value: 'dumbbells', label: 'ดัมเบล' },
  { value: 'resistance_bands', label: 'ยางยืด' },
  { value: 'barbell', label: 'บาร์เบล' },
  { value: 'bench', label: 'ม้านั่ง' },
  { value: 'machines', label: 'เครื่องออกกำลังกาย' },
];

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-xl border px-4 py-3 ${
        selected
          ? 'border-emerald-600 bg-emerald-50'
          : 'border-slate-300 bg-white'
      }`}
      onPress={onPress}
    >
      <Text
        className={
          selected ? 'font-semibold text-emerald-800' : 'text-slate-700'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text className="font-medium text-slate-800">{children}</Text>;
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

export default function OnboardingScreen() {
  const { session } = useAuth();
  const { profile, loading, error, retry, completeOnboarding } = useProfile();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState<GoalType>('maintain');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [workoutDays, setWorkoutDays] = useState('3');
  const [location, setLocation] = useState<TrainingLocation>('home');
  const [experience, setExperience] = useState<ExperienceLevel>('beginner');
  const [equipment, setEquipment] = useState<Equipment[]>(['bodyweight']);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(
    () => ({
      goal: goals.find((item) => item.value === goal)?.label,
      activity:
        activities.find((item) => item.value === activity)?.label ?? 'ไม่ระบุ',
      location: locations.find((item) => item.value === location)?.label,
      experience: experiences.find((item) => item.value === experience)?.label,
      equipment:
        equipment.length > 0
          ? equipment
              .map(
                (value) =>
                  equipmentOptions.find((item) => item.value === value)?.label,
              )
              .join(', ')
          : 'ไม่มีอุปกรณ์',
    }),
    [activity, equipment, experience, goal, location],
  );

  if (!session) return <Redirect href="/(auth)/login" />;
  if (loading) return <ProfileStateScreen />;
  if (error) return <ProfileStateScreen error={error} onRetry={retry} />;
  if (profile?.profile?.onboardingCompleted) return <Redirect href="/home" />;

  function validateCurrentStep() {
    if (step === 1) {
      if (!displayName.trim()) return 'กรุณากรอกชื่อที่ต้องการแสดง';
      if (displayName.trim().length > 100)
        return 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
      if (birthDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
          return 'วันเกิดต้องอยู่ในรูปแบบ YYYY-MM-DD';
        const parsed = new Date(`${birthDate}T00:00:00Z`);
        if (
          Number.isNaN(parsed.valueOf()) ||
          parsed < new Date('1900-01-01T00:00:00Z') ||
          parsed > new Date()
        )
          return 'กรุณาระบุวันเกิดที่ถูกต้อง';
      }
      const heightNumber = optionalNumber(height);
      if (heightNumber !== null && (heightNumber <= 0 || heightNumber > 300))
        return 'ส่วนสูงต้องมากกว่า 0 และไม่เกิน 300 ซม.';
      const weightNumber = optionalNumber(weight);
      if (weightNumber !== null && (weightNumber <= 0 || weightNumber > 500))
        return 'น้ำหนักต้องมากกว่า 0 และไม่เกิน 500 กก.';
    }
    if (step === 2) {
      const days = Number(workoutDays);
      if (!Number.isInteger(days) || days < 0 || days > 7)
        return 'จำนวนวันออกกำลังกายต้องเป็น 0–7 วัน';
    }
    return '';
  }

  function next() {
    const validationError = validateCurrentStep();
    setFormError(validationError);
    if (!validationError) setStep((value) => Math.min(4, value + 1));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      await completeOnboarding({
        displayName: displayName.trim(),
        birthDate: birthDate || null,
        heightCm: optionalNumber(height),
        startingWeightKg: optionalNumber(weight),
        goalType: goal,
        activityLevel: activity,
        workoutDays: Number(workoutDays),
        trainingLocation: location,
        experienceLevel: experience,
        availableEquipment: equipment,
      });
      // No navigation here: the saved profile flips onboardingCompleted, and
      // the <Redirect href="/home" /> guard above takes over.
    } catch {
      setFormError('บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow px-6 py-6"
        >
          <View className="mx-auto w-full max-w-xl flex-1">
            <Text className="text-sm font-semibold text-emerald-700">
              ขั้นตอนที่ {step} จาก 4
            </Text>
            <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <View
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${step * 25}%` }}
              />
            </View>

            <View className="mt-7 flex-1 gap-4">
              {step === 1 ? (
                <>
                  <Text className="text-2xl font-bold text-slate-950">
                    ข้อมูลส่วนตัว
                  </Text>
                  <Text className="leading-6 text-slate-600">
                    ข้อมูลรูปร่างไม่บังคับ และแก้ไขภายหลังได้
                  </Text>
                  <AuthField
                    accessibilityLabel="ชื่อที่ต้องการแสดง"
                    label="ชื่อที่ต้องการแสดง *"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                    placeholder="ชื่อของคุณ"
                  />
                  <AuthField
                    accessibilityLabel="วันเกิด"
                    label="วันเกิด (ไม่บังคับ)"
                    value={birthDate}
                    onChangeText={setBirthDate}
                    keyboardType="numbers-and-punctuation"
                    placeholder="YYYY-MM-DD"
                  />
                  <AuthField
                    accessibilityLabel="ส่วนสูงเซนติเมตร"
                    label="ส่วนสูง ซม. (ไม่บังคับ)"
                    value={height}
                    onChangeText={setHeight}
                    keyboardType="decimal-pad"
                    placeholder="เช่น 170"
                  />
                  <AuthField
                    accessibilityLabel="น้ำหนักเริ่มต้นกิโลกรัม"
                    label="น้ำหนักเริ่มต้น กก. (ไม่บังคับ)"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    placeholder="เช่น 65.5"
                  />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Text className="text-2xl font-bold text-slate-950">
                    เป้าหมายการออกกำลังกาย
                  </Text>
                  <SectionLabel>เป้าหมายหลัก *</SectionLabel>
                  {goals.map((item) => (
                    <Choice
                      key={item.value}
                      label={item.label}
                      selected={goal === item.value}
                      onPress={() => setGoal(item.value)}
                    />
                  ))}
                  <SectionLabel>ระดับกิจกรรม (ไม่บังคับ)</SectionLabel>
                  <Choice
                    label="ไม่ระบุ"
                    selected={activity === null}
                    onPress={() => setActivity(null)}
                  />
                  {activities.map((item) => (
                    <Choice
                      key={item.value}
                      label={item.label}
                      selected={activity === item.value}
                      onPress={() => setActivity(item.value)}
                    />
                  ))}
                  <AuthField
                    accessibilityLabel="จำนวนวันออกกำลังกายต่อสัปดาห์"
                    label="วันออกกำลังกายต่อสัปดาห์ (0–7) *"
                    value={workoutDays}
                    onChangeText={setWorkoutDays}
                    keyboardType="number-pad"
                    placeholder="3"
                  />
                  <Text className="text-sm leading-5 text-slate-500">
                    ระบบยังไม่กำหนดเป้าหมายแคลอรีหรือสารอาหารอัตโนมัติ
                  </Text>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Text className="text-2xl font-bold text-slate-950">
                    รูปแบบการฝึก
                  </Text>
                  <SectionLabel>สถานที่ฝึก *</SectionLabel>
                  {locations.map((item) => (
                    <Choice
                      key={item.value}
                      label={item.label}
                      selected={location === item.value}
                      onPress={() => setLocation(item.value)}
                    />
                  ))}
                  <SectionLabel>ประสบการณ์ *</SectionLabel>
                  {experiences.map((item) => (
                    <Choice
                      key={item.value}
                      label={item.label}
                      selected={experience === item.value}
                      onPress={() => setExperience(item.value)}
                    />
                  ))}
                  <SectionLabel>อุปกรณ์ที่มี (เลือกได้หลายรายการ)</SectionLabel>
                  {equipmentOptions.map((item) => (
                    <Choice
                      key={item.value}
                      label={item.label}
                      selected={equipment.includes(item.value)}
                      onPress={() =>
                        setEquipment((current) =>
                          current.includes(item.value)
                            ? current.filter((value) => value !== item.value)
                            : [...current, item.value],
                        )
                      }
                    />
                  ))}
                  <Text className="text-sm leading-5 text-slate-500">
                    หากฝึกที่บ้านโดยไม่มีอุปกรณ์ สามารถไม่เลือกอุปกรณ์ได้
                  </Text>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <Text className="text-2xl font-bold text-slate-950">
                    ตรวจสอบข้อมูล
                  </Text>
                  <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-5">
                    <Text className="text-slate-700">ชื่อ: {displayName}</Text>
                    <Text className="text-slate-700">
                      วันเกิด: {birthDate || 'ไม่ระบุ'}
                    </Text>
                    <Text className="text-slate-700">
                      ส่วนสูง: {height ? `${height} ซม.` : 'ไม่ระบุ'}
                    </Text>
                    <Text className="text-slate-700">
                      น้ำหนักเริ่มต้น: {weight ? `${weight} กก.` : 'ไม่ระบุ'}
                    </Text>
                    <Text className="text-slate-700">
                      เป้าหมาย: {summary.goal}
                    </Text>
                    <Text className="text-slate-700">
                      ระดับกิจกรรม: {summary.activity}
                    </Text>
                    <Text className="text-slate-700">
                      ฝึก {workoutDays} วันต่อสัปดาห์
                    </Text>
                    <Text className="text-slate-700">
                      สถานที่: {summary.location}
                    </Text>
                    <Text className="text-slate-700">
                      ประสบการณ์: {summary.experience}
                    </Text>
                    <Text className="text-slate-700">
                      อุปกรณ์: {summary.equipment}
                    </Text>
                  </View>
                </>
              ) : null}

              {formError ? (
                <Text className="rounded-xl bg-red-50 p-3 text-red-700">
                  {formError}
                </Text>
              ) : null}
            </View>

            <View className="mt-8 flex-row gap-3">
              {step > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4"
                  disabled={submitting}
                  onPress={() => {
                    setFormError('');
                    setStep((value) => value - 1);
                  }}
                >
                  <Text className="font-semibold text-slate-700">ย้อนกลับ</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                className="min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 disabled:opacity-60"
                disabled={submitting}
                onPress={step === 4 ? submit : next}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="font-semibold text-white">
                    {step === 4 ? 'ยืนยันและบันทึก' : 'ถัดไป'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
