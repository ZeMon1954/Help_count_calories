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
import { PrototypeBadge } from '@/components/ui/PrototypeBadge';
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
  const remaining =
    calorieTarget === null
      ? null
      : Math.max(0, calorieTarget - consumed.calories);

  return (
    <Screen
      title={`สวัสดี ${profile?.profile?.displayName ?? ''}`.trim()}
      subtitle="ภาพรวมสุขภาพวันนี้"
      action={<PrototypeBadge label="Workout ยังเป็นต้นแบบ" />}
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
          <Card>
            <Text className="text-sm font-medium text-slate-500">
              {remaining === null ? 'พลังงานที่บริโภค' : 'พลังงานคงเหลือ'}
            </Text>
            <View className="mt-2 flex-row items-end gap-2">
              <Text className="text-4xl font-bold text-slate-950">
                {Math.round(remaining ?? consumed.calories)}
              </Text>
              <Text className="pb-1 text-slate-500">kcal</Text>
            </View>
            {calorieTarget !== null ? (
              <>
                <ProgressBar
                  value={(consumed.calories / calorieTarget) * 100}
                />
                <Text className="mt-3 text-sm text-slate-500">
                  กินแล้ว {Math.round(consumed.calories)} จาก {calorieTarget}{' '}
                  kcal
                </Text>
              </>
            ) : (
              <Text className="mt-3 text-sm leading-5 text-amber-700">
                ยังไม่มีเป้าหมายแคลอรีจริง ระบบจึงไม่คำนวณพลังงานคงเหลือ
              </Text>
            )}
          </Card>

          <View className="flex-row gap-3">
            {(
              [
                ['โปรตีน', consumed.protein_g, summary?.targets.protein_g],
                ['คาร์บ', consumed.carbs_g, summary?.targets.carbs_g],
                ['ไขมัน', consumed.fat_g, summary?.targets.fat_g],
              ] as const
            ).map(([label, value, target]) => (
              <View
                key={label}
                className="flex-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <Text className="text-xs text-slate-500">{label}</Text>
                <Text className="font-bold text-slate-900">
                  {Math.round(value)}g
                </Text>
                <Text className="text-xs text-slate-400">
                  {target === null || target === undefined
                    ? 'ยังไม่มีเป้าหมาย'
                    : `จาก ${target}g`}
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
          className="min-h-20 flex-1 justify-center rounded-2xl bg-emerald-600 p-4"
          onPress={() => router.push('/add-food')}
        >
          <Text className="font-bold text-white">ค้นหาอาหาร</Text>
          <Text className="mt-1 text-xs text-emerald-100">Catalog จริง</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-20 flex-1 justify-center rounded-2xl bg-slate-900 p-4"
          onPress={() => router.push('/food-scanner')}
        >
          <Text className="font-bold text-white">สแกนอาหาร</Text>
          <Text className="mt-1 text-xs text-slate-300">ต้นแบบเท่านั้น</Text>
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
              className="flex-row items-center justify-between border-b border-slate-100 py-3 last:border-b-0"
            >
              <View className="flex-1 pr-4">
                <Text className="font-semibold text-slate-900">
                  {item.food_name}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {item.quantity_g
                    ? `${item.quantity_g} กรัม`
                    : 'ไม่ระบุปริมาณ'}
                </Text>
              </View>
              <Text className="font-semibold text-slate-700">
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

      <SectionHeader title="การฝึกวันนี้" />
      <Card>
        <PrototypeBadge />
        <Text className="mt-3 text-xl font-bold text-slate-950">
          Full Body A
        </Text>
        <Text className="mt-1 text-slate-500">4 ท่า · ประมาณ 45 นาที</Text>
        <View className="mt-4">
          <ActionButton
            label="ดูโปรแกรมวันนี้"
            onPress={() => router.push('/workout')}
          />
        </View>
      </Card>
    </Screen>
  );
}
