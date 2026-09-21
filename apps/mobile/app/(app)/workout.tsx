import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ActionButton, Card, EmptyState, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import {
  createDefaultWorkoutPlan,
  fetchActiveWorkout,
  type ActiveWorkoutPlan,
  type WorkoutDay,
} from '@/services/api/workout';

const dayLabels = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

export default function WorkoutScreen() {
  const { session } = useAuth();
  const [plan, setPlan] = useState<ActiveWorkoutPlan | null>(null);
  const [selectedDay, setSelectedDay] = useState<WorkoutDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchActiveWorkout(session.access_token);
      setPlan(next);
      const today = new Date().getDay() || 7;
      setSelectedDay(
        next?.days.find((day) => day.dayOfWeek === today) ??
          next?.days[0] ??
          null,
      );
    } catch {
      setError('โหลดโปรแกรมฝึกไม่สำเร็จ กรุณาตรวจสอบเครือข่าย');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  async function createPlan() {
    if (!session?.access_token || creating) return;
    setCreating(true);
    setError('');
    try {
      await createDefaultWorkoutPlan(session.access_token);
      await load();
    } catch {
      setError('สร้างโปรแกรมเริ่มต้นไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setCreating(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen title="การฝึก" subtitle="โปรแกรมฝึกจริงจากบัญชีของคุณ">
      {loading ? (
        <Card>
          <ActivityIndicator color="#059669" />
          <Text className="mt-3 text-center text-slate-500">
            กำลังโหลดโปรแกรมฝึก...
          </Text>
        </Card>
      ) : error ? (
        <EmptyState
          title="โหลดโปรแกรมไม่ได้"
          description={error}
          action={<ActionButton label="ลองอีกครั้ง" onPress={() => void load()} />}
        />
      ) : !plan ? (
        <EmptyState
          title="ยังไม่มีโปรแกรมฝึก"
          description="สร้างโปรแกรม Full Body เริ่มต้นตามจำนวนวันฝึกจากโปรไฟล์ของคุณ"
          action={
            <ActionButton
              label={creating ? 'กำลังสร้างโปรแกรม...' : 'สร้างโปรแกรมเริ่มต้น'}
              disabled={creating}
              onPress={() => void createPlan()}
            />
          }
        />
      ) : (
        <>
          <Card>
            <Text className="text-sm font-semibold text-emerald-700">
              โปรแกรมที่กำลังใช้งาน
            </Text>
            <Text className="mt-2 text-2xl font-bold text-slate-950">
              {plan.name}
            </Text>
            <Text className="mt-1 text-slate-500">
              {plan.source === 'ai' ? 'สร้างโดย AI' : 'สร้างด้วยตนเอง'}
            </Text>
          </Card>

          <View className="flex-row gap-2">
            {plan.days.map((day) => (
              <Pressable
                key={day.id}
                className={`min-h-16 flex-1 items-center justify-center rounded-xl ${selectedDay?.id === day.id ? 'bg-emerald-600' : 'border border-slate-200 bg-white'}`}
                onPress={() => setSelectedDay(day)}
              >
                <Text
                  className={
                    selectedDay?.id === day.id
                      ? 'font-bold text-white'
                      : 'font-bold text-slate-700'
                  }
                >
                  {dayLabels[day.dayOfWeek - 1]}
                </Text>
              </Pressable>
            ))}
          </View>

          {selectedDay?.isRestDay ? (
            <EmptyState
              title="วันนี้เป็นวันพัก"
              description="พักฟื้นให้เพียงพอก่อนการฝึกครั้งถัดไป"
            />
          ) : selectedDay ? (
            <>
              <Card>
                <Text className="text-2xl font-bold text-slate-950">
                  {selectedDay.name ?? plan.name}
                </Text>
                <Text className="mt-1 text-slate-500">
                  {selectedDay.exercises.length} ท่า
                </Text>
                <View className="mt-4">
                  <ActionButton
                    label="เริ่มการฝึก"
                    disabled={!selectedDay.exercises.length}
                    onPress={() =>
                      router.push({
                        pathname: '/workout-session',
                        params: { dayId: selectedDay.id },
                      })
                    }
                  />
                </View>
              </Card>
              <SectionHeader title="รายการท่า" />
              {selectedDay.exercises.map((exercise, index) => (
                <Card key={exercise.id}>
                  <View className="flex-row gap-3">
                    <Text className="font-bold text-emerald-700">{index + 1}</Text>
                    <View className="flex-1">
                      <Text className="font-bold text-slate-950">
                        {exercise.name}
                      </Text>
                      <Text className="mt-1 text-sm text-slate-500">
                        {exercise.targetSets ?? '-'} เซ็ต ×{' '}
                        {exercise.targetReps ?? '-'} · พัก{' '}
                        {exercise.restSeconds ?? 0} วินาที
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
