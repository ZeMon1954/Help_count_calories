import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ActionButton, Card, EmptyState, ProgressBar, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { fetchProgress, saveWeight, type ProgressSnapshot } from '@/services/api/progress';

export default function ProgressScreen() {
  const { session } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<ProgressSnapshot | null>(null);
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchProgress(session.access_token, days));
    } catch {
      setError('โหลดข้อมูลความคืบหน้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [days, session?.access_token]);

  useFocusEffect(useCallback(() => void load(), [load]));

  async function addWeight() {
    if (!session?.access_token || saving) return;
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0 || value > 500) {
      setError('กรุณาระบุน้ำหนักระหว่าง 0 ถึง 500 กก.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveWeight(session.access_token, value);
      setWeight('');
      await load();
    } catch {
      setError('บันทึกน้ำหนักไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const weights = data?.weightHistory ?? [];
  const min = weights.length ? Math.min(...weights.map((item) => item.weightKg)) : 0;
  const max = weights.length ? Math.max(...weights.map((item) => item.weightKg)) : 0;

  return (
    <Screen title="ความคืบหน้า" subtitle="น้ำหนัก โภชนาการ และการฝึกจากข้อมูลจริง">
      <View className="flex-row gap-2">
        {([7, 30, 90] as const).map((value) => (
          <Pressable
            key={value}
            className={`min-h-11 flex-1 items-center justify-center rounded-xl ${days === value ? 'bg-emerald-600' : 'border border-slate-300 bg-white'}`}
            onPress={() => setDays(value)}
          >
            <Text className={days === value ? 'text-white' : 'text-slate-700'}>
              {value} วัน
            </Text>
          </Pressable>
        ))}
      </View>

      <Card>
        <Text className="font-bold text-slate-950">บันทึกน้ำหนักวันนี้</Text>
        <View className="mt-3 flex-row items-center gap-2">
          <TextInput
            accessibilityLabel="น้ำหนักกิโลกรัม"
            className="min-h-12 flex-1 rounded-xl border border-slate-300 px-3 text-slate-900"
            keyboardType="decimal-pad"
            placeholder="เช่น 70.5"
            value={weight}
            onChangeText={setWeight}
          />
          <View className="flex-1">
            <ActionButton
              label={saving ? 'กำลังบันทึก...' : 'บันทึก'}
              disabled={saving}
              onPress={() => void addWeight()}
            />
          </View>
        </View>
      </Card>

      {error ? <Text className="rounded-xl bg-red-50 p-3 text-red-700">{error}</Text> : null}
      {loading ? <ActivityIndicator color="#059669" /> : null}

      {!loading ? (
        <>
          <SectionHeader title="น้ำหนัก" />
          {weights.length ? (
            <Card>
              <View className="flex-row items-end justify-between gap-2" style={{ height: 180 }}>
                {weights.slice(-8).map((item) => {
                  const height = 55 + ((item.weightKg - min) / Math.max(0.1, max - min)) * 90;
                  return (
                    <View key={item.id} className="flex-1 items-center justify-end gap-2">
                      <Text className="text-xs font-semibold text-slate-600">{item.weightKg}</Text>
                      <View className="w-full rounded-t-lg bg-emerald-500" style={{ height }} />
                      <Text className="text-[10px] text-slate-400">
                        {new Date(item.recordedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : (
            <EmptyState title="ยังไม่มีข้อมูลน้ำหนัก" description="เพิ่มน้ำหนักรายการแรกได้จากช่องด้านบน" />
          )}

          <SectionHeader title="ความสม่ำเสมอของแคลอรี" />
          <Card>
            {data?.calorieAdherence.percentage === null ? (
              <Text className="text-slate-500">ยังไม่มีเป้าหมายแคลอรีหรือข้อมูลอาหารเพียงพอ</Text>
            ) : (
              <>
                <Text className="text-3xl font-bold text-slate-950">
                  {data?.calorieAdherence.percentage}%
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  อยู่ในช่วง ±10% ของเป้าหมาย {data?.calorieAdherence.daysWithinTarget}/
                  {data?.calorieAdherence.daysLogged} วันที่บันทึก
                </Text>
                <View className="mt-4"><ProgressBar value={data?.calorieAdherence.percentage ?? 0} /></View>
              </>
            )}
          </Card>

          <SectionHeader title="ประวัติการฝึก" />
          {data?.workoutHistory.length ? (
            <Card>
              {data.workoutHistory.map((item) => (
                <View key={item.id} className="flex-row justify-between border-b border-slate-100 py-3 last:border-b-0">
                  <View><Text className="font-semibold text-slate-900">{item.title}</Text><Text className="mt-1 text-sm text-slate-500">{new Date(item.startedAt).toLocaleDateString('th-TH')}</Text></View>
                  <Text className="text-slate-600">{item.durationMinutes ?? '-'} นาที</Text>
                </View>
              ))}
            </Card>
          ) : (
            <EmptyState title="ยังไม่มีประวัติการฝึก" description="เซสชันที่กดจบแล้วจะแสดงที่นี่" />
          )}
        </>
      ) : null}
    </Screen>
  );
}
