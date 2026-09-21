import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ActionButton, Card } from '@/components/ui/Kit';
import { PrototypeBadge } from '@/components/ui/PrototypeBadge';
import { Screen } from '@/components/ui/Screen';
import { MOCK_EXERCISES } from '@/data/mock-fitness';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = MOCK_EXERCISES.find((item) => item.id === id);

  return (
    <Screen
      title={exercise?.name ?? 'ไม่พบท่าออกกำลังกาย'}
      subtitle={exercise?.target}
      action={<PrototypeBadge />}
    >
      <Pressable
        className="min-h-11 justify-center"
        onPress={() => router.back()}
      >
        <Text className="font-semibold text-emerald-700">‹ กลับไปโปรแกรม</Text>
      </Pressable>
      {exercise ? (
        <>
          <View className="aspect-video items-center justify-center rounded-3xl bg-slate-900">
            <Text className="text-5xl text-white">▶</Text>
            <Text className="mt-3 text-slate-300">
              พื้นที่วิดีโอสาธิตต้นแบบ
            </Text>
          </View>
          <Card>
            <View className="flex-row justify-between">
              <View>
                <Text className="text-sm text-slate-500">เซ็ต</Text>
                <Text className="mt-1 text-xl font-bold text-slate-950">
                  {exercise.sets}
                </Text>
              </View>
              <View>
                <Text className="text-sm text-slate-500">ครั้ง</Text>
                <Text className="mt-1 text-xl font-bold text-slate-950">
                  {exercise.reps}
                </Text>
              </View>
              <View>
                <Text className="text-sm text-slate-500">พัก</Text>
                <Text className="mt-1 text-xl font-bold text-slate-950">
                  {exercise.restSeconds} วิ.
                </Text>
              </View>
            </View>
          </Card>
          <Card>
            <Text className="text-lg font-bold text-slate-950">คำแนะนำ</Text>
            <Text className="mt-2 leading-6 text-slate-600">
              {exercise.note}
            </Text>
          </Card>
          <ActionButton
            label="เริ่มเซสชันจำลอง"
            onPress={() => router.push('/workout-session')}
          />
        </>
      ) : null}
    </Screen>
  );
}
