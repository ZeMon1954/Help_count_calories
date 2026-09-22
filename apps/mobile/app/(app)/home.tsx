import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  ActionButton,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeader,
} from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import {
  fetchFoodLogs,
  fetchNutritionSummary,
  type FoodLog,
  type NutritionSummary,
} from '@/services/api/food';

export default function HomeScreen() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      const [nextSummary, nextLogs] = await Promise.all([
        fetchNutritionSummary(session.access_token, today),
        fetchFoodLogs(session.access_token, today),
      ]);
      setSummary(nextSummary);
      setLogs(nextLogs.logs);
    } catch {
      setError('โหลดข้อมูลโภชนาการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const entries = logs.flatMap((log) =>
    log.items.map((item) => ({ ...item, meal: log.meal_type })),
  );
  const consumed = summary?.consumed ?? {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  };
  const calorieTarget = summary?.targets.calories ?? null;
  const exerciseCalories = summary?.exercise?.calories ?? 0;
  const remaining =
    calorieTarget === null
      ? null
      : Math.max(0, calorieTarget - consumed.calories);

  return (
    <Screen
      title={`สวัสดี ${profile?.profile?.displayName ?? ''}`.trim()}
      subtitle="ภาพรวมสุขภาพวันนี้"
    >
      {loading ? (
        <Card>
          <ActivityIndicator color="#059669" />
          <Text className="mt-3 text-center text-slate-500">
            กำลังโหลดโภชนาการจริง...
          </Text>
        </Card>
      ) : error ? (
        <EmptyState
          title="โหลดข้อมูลไม่ได้"
          description={error}
          action={
            <ActionButton label="ลองอีกครั้ง" onPress={() => void load()} />
          }
        />
      ) : (
        <>
          <View className="overflow-hidden rounded-3xl bg-slate-900 p-6 shadow-xl shadow-slate-900/20">
            <Text className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
              {remaining === null ? 'พลังงานที่บริโภค' : 'พลังงานคงเหลือ (kcal)'}
            </Text>
            <View className="mt-2 flex-row items-baseline gap-2">
              <Text className="text-5xl font-extrabold tracking-tighter text-white">
                {Math.round(remaining ?? consumed.calories)}
              </Text>
            </View>
            {calorieTarget !== null ? (
              <View className="mt-6">
                <ProgressBar
                  value={(consumed.calories / calorieTarget) * 100}
                  color="bg-primary-500"
                />
                <View className="mt-3 flex-row justify-between">
                  <Text className="text-sm font-medium text-slate-400">
                    บริโภค {Math.round(consumed.calories)}
                  </Text>
                  <Text className="text-sm font-medium text-slate-400">
                    เป้าหมาย {calorieTarget}
                  </Text>
                </View>
                <View className="mt-4 flex-row gap-3 border-t border-white/10 pt-4">
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-slate-500">
                      กินแล้ว
                    </Text>
                    <Text className="mt-1 text-lg font-bold text-white">
                      {Math.round(consumed.calories)} kcal
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-slate-500">
                      ออกกำลังกาย
                    </Text>
                    <Text className="mt-1 text-lg font-bold text-emerald-400">
                      {Math.round(exerciseCalories)} kcal
                    </Text>
                  </View>
                </View>
                <Text className="mt-3 text-xs leading-4 text-slate-500">
                  แคลอรีจากกิจกรรมเป็นค่าประมาณ และไม่ถูกนำมาบวกเพิ่มในโควตาการกินเพื่อป้องกันการนับซ้ำกับระดับกิจกรรม
                </Text>
              </View>
            ) : (
              <Text className="mt-4 text-sm leading-5 text-amber-400">
                ยังไม่มีเป้าหมายแคลอรี
              </Text>
            )}
          </View>

          <View className="flex-row gap-3">
            {(
              [
                ['โปรตีน', consumed.protein_g, summary?.targets.protein_g, 'bg-rose-50 border-rose-100 text-rose-600', 'text-rose-900'],
                ['คาร์บ', consumed.carbs_g, summary?.targets.carbs_g, 'bg-amber-50 border-amber-100 text-amber-600', 'text-amber-900'],
                ['ไขมัน', consumed.fat_g, summary?.targets.fat_g, 'bg-blue-50 border-blue-100 text-blue-600', 'text-blue-900'],
              ] as const
            ).map(([label, value, target, colorClass, textDarkClass]) => (
              <View
                key={label}
                className={`flex-1 gap-2 rounded-3xl border p-4 shadow-sm shadow-slate-100/50 ${colorClass}`}
              >
                <Text className={`text-xs font-bold uppercase tracking-wider ${colorClass}`}>{label}</Text>
                <Text className={`text-2xl font-black ${textDarkClass}`}>
                  {Math.round(value as number)}<Text className="text-sm font-bold">g</Text>
                </Text>
                <Text className={`text-xs font-medium opacity-60 ${textDarkClass}`}>
                  {target === null || target === undefined
                    ? 'ไม่มีเป้า'
                    : `เป้า ${target}g`}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionHeader title="เพิ่มอย่างรวดเร็ว" />
      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          className="min-h-[88px] flex-1 justify-center rounded-3xl bg-primary-600 p-5 shadow-lg shadow-primary-600/30 active:scale-[0.98]"
          onPress={() => router.push('/add-food')}
        >
          <Text className="text-lg font-bold text-white">ค้นหาอาหาร</Text>
          <Text className="mt-1 text-sm font-medium text-primary-100">จากฐานข้อมูล</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-[88px] flex-1 justify-center rounded-3xl bg-slate-900 p-5 shadow-lg shadow-slate-900/30 active:scale-[0.98]"
          onPress={() => router.push('/food-scanner')}
        >
          <Text className="text-lg font-bold text-white">สแกนอาหาร</Text>
          <Text className="mt-1 text-sm font-medium text-slate-400">ด้วย AI</Text>
        </Pressable>
      </View>

      <SectionHeader
        title="อาหารวันนี้"
        action={
          <Pressable onPress={() => router.push('/food')}>
            <Text className="font-semibold text-emerald-700">ดูทั้งหมด</Text>
          </Pressable>
        }
      />
      {entries.length ? (
        <Card>
          {entries.slice(0, 3).map((item) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between border-b border-slate-100 py-4 last:border-b-0"
            >
              <View className="flex-row items-center gap-4 flex-1 pr-4">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Text className="text-lg">🍽️</Text>
                </View>
                <View>
                  <Text className="text-base font-bold text-slate-900">
                    {item.food_name}
                  </Text>
                  <Text className="mt-0.5 text-sm font-medium text-slate-500">
                    {item.quantity_g
                      ? `${item.quantity_g} กรัม`
                      : 'ไม่ระบุปริมาณ'}
                  </Text>
                </View>
              </View>
              <Text className="text-base font-extrabold text-primary-600">
                {Math.round(item.calories)} kcal
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState
          title="ยังไม่มีรายการอาหารจริง"
          description="ฐานข้อมูลของวันนี้ยังว่าง การเพิ่มลงไดอารีรอ atomic RPC"
        />
      )}

    </Screen>
  );
}
