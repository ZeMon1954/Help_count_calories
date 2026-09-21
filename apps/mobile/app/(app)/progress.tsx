import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, Text, TextInput, View } from 'react-native';
import { LineChart, ProgressChart } from 'react-native-chart-kit';

import { ActionButton, Card, EmptyState, SectionHeader } from '@/components/ui/Kit';
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
  return (
    <Screen title="ความคืบหน้า" subtitle="น้ำหนักและโภชนาการจากข้อมูลจริง">
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
              <LineChart
                data={{
                  labels: weights.slice(-6).map(w => new Date(w.recordedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })),
                  datasets: [{ data: weights.slice(-6).map(w => w.weightKg) }]
                }}
                width={Dimensions.get('window').width - 72} // from padding
                height={220}
                yAxisSuffix=" kg"
                yAxisInterval={1}
                chartConfig={{
                  backgroundColor: '#ffffff',
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: '6', strokeWidth: '2', stroke: '#059669' }
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16, paddingRight: 32 }}
              />
            </Card>
          ) : (
            <EmptyState title="ยังไม่มีข้อมูลน้ำหนัก" description="เพิ่มน้ำหนักรายการแรกได้จากช่องด้านบน" />
          )}

          <SectionHeader title="ความสม่ำเสมอของแคลอรี" />
          <Card>
            {data?.calorieAdherence.percentage === null ? (
              <Text className="text-slate-500">ยังไม่มีเป้าหมายแคลอรีหรือข้อมูลอาหารเพียงพอ</Text>
            ) : (
              <View className="flex-row items-center gap-4">
                <ProgressChart
                  data={[ (data?.calorieAdherence.percentage ?? 0) / 100 ]}
                  width={100}
                  height={100}
                  strokeWidth={12}
                  radius={40}
                  chartConfig={{
                    backgroundGradientFrom: '#ffffff',
                    backgroundGradientTo: '#ffffff',
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                  }}
                  hideLegend={true}
                />
                <View className="flex-1">
                  <Text className="text-3xl font-bold text-slate-950">
                    {data?.calorieAdherence.percentage}%
                  </Text>
                  <Text className="mt-1 text-sm text-slate-500">
                    อยู่ในช่วง ±10% ของเป้าหมาย {data?.calorieAdherence.daysWithinTarget}/
                    {data?.calorieAdherence.daysLogged} วันที่บันทึก
                  </Text>
                </View>
              </View>
            )}
          </Card>

        </>
      ) : null}
    </Screen>
  );
}
