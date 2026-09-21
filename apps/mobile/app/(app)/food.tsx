import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  ActionButton,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeader,
} from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import {
  deleteFoodLogItem,
  fetchFoodLogs,
  fetchNutritionSummary,
  updateFoodLogItemQuantity,
  type FoodLog,
  type MealType,
  type NutritionSummary,
} from '@/services/api/food';

const meals: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'มื้อเช้า' },
  { key: 'lunch', label: 'มื้อกลางวัน' },
  { key: 'dinner', label: 'มื้อเย็น' },
  { key: 'snack', label: 'ของว่าง' },
];

function shiftDate(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateLabel(date: Date) {
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'วันนี้';
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function FoodDiaryScreen() {
  const { session } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingQuantity, setEditingQuantity] = useState('');
  const [updatingId, setUpdatingId] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const [diary, nutrition] = await Promise.all([
        fetchFoodLogs(session.access_token, selectedDate),
        fetchNutritionSummary(session.access_token, selectedDate),
      ]);
      setLogs(diary.logs);
      setSummary(nutrition);
    } catch {
      setError('ไม่สามารถโหลด Food Diary ได้');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function removeItem(id: string) {
    if (!session?.access_token || deletingId) return;
    setDeletingId(id);
    try {
      await deleteFoodLogItem(session.access_token, id);
      await load();
    } catch {
      setError('ลบรายการไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setDeletingId('');
    }
  }

  async function saveQuantity(id: string) {
    if (!session?.access_token || updatingId) return;
    const quantityG = Number(editingQuantity);
    if (!Number.isFinite(quantityG) || quantityG <= 0 || quantityG > 100_000) {
      setError('กรุณาระบุปริมาณอาหารเป็นกรัมให้ถูกต้อง');
      return;
    }
    setUpdatingId(id);
    setError('');
    try {
      await updateFoodLogItemQuantity(session.access_token, id, quantityG);
      setEditingId('');
      setEditingQuantity('');
      await load();
    } catch {
      setError('แก้ไขปริมาณอาหารไม่สำเร็จ กรุณาลองใหม่');
    } finally {

      setUpdatingId('');
    }
  }

  return (
    <Screen title="บันทึกอาหาร" subtitle="ข้อมูลจริงจาก Food Diary ของคุณ">
      <View className="flex-row items-center justify-between rounded-3xl border border-slate-100 bg-white p-3 shadow-sm shadow-slate-200/50">
        <Pressable
          accessibilityRole="button"
          className="min-h-12 min-w-12 items-center justify-center rounded-2xl bg-slate-50 active:bg-slate-100"
          onPress={() => setSelectedDate((date) => shiftDate(date, -1))}
        >
          <Text className="text-xl font-bold text-slate-700">‹</Text>
        </Pressable>
        <Pressable onPress={() => setSelectedDate(new Date())}>
          <Text className="text-lg font-bold text-slate-900">
            {dateLabel(selectedDate)}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 min-w-12 items-center justify-center rounded-2xl bg-slate-50 active:bg-slate-100"
          onPress={() => setSelectedDate((date) => shiftDate(date, 1))}
        >
          <Text className="text-xl font-bold text-slate-700">›</Text>
        </Pressable>
      </View>

      {loading ? (
        <Card>
          <ActivityIndicator color="#059669" />
          <Text className="mt-3 text-center text-slate-500">
            กำลังโหลดรายการอาหาร...
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
          {meals.map((meal) => {
            const mealLogs = logs.filter((log) => log.meal_type === meal.key);
            const entries = mealLogs.flatMap((log) => log.items);
            const calories = entries.reduce(
              (sum, item) => sum + item.calories,
              0,
            );
            return (
              <View key={meal.key} className="gap-2">
                <SectionHeader
                  title={meal.label}
                  action={
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/add-food',
                          params: { meal: meal.key },
                        })
                      }
                    >
                      <Text className="text-sm font-bold text-primary-600 active:text-primary-800">
                        + เพิ่ม
                      </Text>
                    </Pressable>
                  }
                />
                <Card>
                  {entries.length ? (
                    <>
                      {entries.map((item) => (
                        <View
                          key={item.id}
                          className="flex-row items-center justify-between border-b border-slate-100 py-3 last:border-b-0"
                        >
                          <View className="flex-1 pr-3">
                            <Text className="font-medium text-slate-900">
                              {item.food_name}
                            </Text>
                            {editingId === item.id ? (
                              <View className="mt-2 flex-row items-center gap-2">
                                <TextInput
                                  accessibilityLabel="แก้ไขปริมาณอาหารเป็นกรัม"
                                  className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 text-slate-900"
                                  keyboardType="decimal-pad"
                                  value={editingQuantity}
                                  onChangeText={setEditingQuantity}
                                />
                                <Pressable
                                  className="min-h-11 justify-center rounded-xl bg-emerald-600 px-3"
                                  disabled={Boolean(updatingId)}
                                  onPress={() => void saveQuantity(item.id)}
                                >
                                  <Text className="font-semibold text-white">
                                    {updatingId === item.id ? 'กำลังบันทึก' : 'บันทึก'}
                                  </Text>
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable
                                onPress={() => {
                                  setEditingId(item.id);
                                  setEditingQuantity(String(item.quantity_g ?? ''));
                                }}
                              >
                                <Text className="mt-1 text-sm text-slate-500">
                                  {item.quantity_g
                                    ? `${item.quantity_g} กรัม · แตะเพื่อแก้ไข`
                                    : 'ไม่ระบุปริมาณ'}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                          <View className="items-end gap-1">
                            <Text className="font-semibold text-slate-700">
                              {Math.round(item.calories)} kcal
                            </Text>
                            <Pressable
                              disabled={Boolean(deletingId)}
                              onPress={() => void removeItem(item.id)}
                            >
                              <Text className="text-sm text-red-600">
                                {deletingId === item.id ? 'กำลังลบ...' : 'ลบ'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                      <Text className="mt-2 text-right text-sm font-semibold text-slate-500">
                        รวม {Math.round(calories)} kcal
                      </Text>
                    </>
                  ) : (
                    <Text className="py-3 text-center text-slate-400">
                      ยังไม่มีรายการในมื้อนี้
                    </Text>
                  )}
                </Card>
              </View>
            );
          })}

          {!logs.some((log) => log.items.length) ? (
            <EmptyState
              title="ยังไม่มีบันทึกในวันนี้"
              description="ค้นหาอาหารหรือสร้างอาหารส่วนตัว แล้วเพิ่มลงในมื้อที่ต้องการได้ทันที"
            />
          ) : null}

          <SectionHeader title="สรุปโภชนาการ" />
          <Card>
            <View className="gap-4">
              {(
                [
                  [
                    'แคลอรี',
                    summary?.consumed.calories ?? 0,
                    summary?.targets.calories,
                    'kcal',
                  ],
                  [
                    'โปรตีน',
                    summary?.consumed.protein_g ?? 0,
                    summary?.targets.protein_g,
                    'g',
                  ],
                  [
                    'คาร์บ',
                    summary?.consumed.carbs_g ?? 0,
                    summary?.targets.carbs_g,
                    'g',
                  ],
                  [
                    'ไขมัน',
                    summary?.consumed.fat_g ?? 0,
                    summary?.targets.fat_g,
                    'g',
                  ],
                ] as const
              ).map(([label, value, target, unit]) => (
                <View key={label} className="gap-2">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-600">{label}</Text>
                    <Text className="font-semibold text-slate-900">
                      {Math.round(value)} {unit}
                      {target === null || target === undefined
                        ? ' · ยังไม่มีเป้าหมาย'
                        : ` / ${target} ${unit}`}
                    </Text>
                  </View>
                  {target ? (
                    <ProgressBar value={(value / target) * 100} />
                  ) : null}
                </View>
              ))}
            </View>
          </Card>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        className="min-h-[56px] items-center justify-center rounded-2xl bg-primary-600 px-5 shadow-sm active:bg-primary-700 active:scale-[0.98]"
        onPress={() => router.push('/add-food')}
      >
        <Text className="text-base font-bold tracking-wide text-white">ค้นหาอาหาร</Text>
      </Pressable>
    </Screen>
  );
}
