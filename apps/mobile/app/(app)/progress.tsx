import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Pressable, Text, TextInput, View } from 'react-native';
import { LineChart, ProgressChart } from 'react-native-chart-kit';

import { ActionButton, Card, EmptyState, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { ApiError } from '@/services/api/client';
import type { LocalImage } from '@/services/api/food-analysis';
import {
  analyzePhysiquePhoto,
  type PhysiqueAnalysisResult,
} from '@/services/api/physique-analysis';
import { fetchProgress, saveWeight, type ProgressSnapshot } from '@/services/api/progress';

export default function ProgressScreen() {
  const { session } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [data, setData] = useState<ProgressSnapshot | null>(null);
  const [weight, setWeight] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<LocalImage | null>(null);
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PhysiqueAnalysisResult | null>(null);

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

  async function chooseProgressPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'ต้องใช้สิทธิ์คลังภาพ',
        'กรุณาอนุญาตให้แอปเลือกรูปสำหรับวิเคราะห์ความคืบหน้า',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
      selectionLimit: 1,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const extension = asset.uri.split('.').pop()?.toLowerCase();
    const mimeType =
      asset.mimeType ??
      (extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg');
    setPhoto({
      uri: asset.uri,
      mimeType,
      fileName: asset.fileName ?? `progress-${Date.now()}.${extension ?? 'jpg'}`,
    });
    setAnalysis(null);
    setError('');
  }

  async function analyzePhoto() {
    if (!session?.access_token || !photo || analyzing) return;
    const weightKg = Number(weight);
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 500) {
      setError('กรุณาใส่น้ำหนักปัจจุบันระหว่าง 30–500 กก. ก่อนวิเคราะห์');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const result = await analyzePhysiquePhoto(
        session.access_token,
        photo,
        weightKg,
        sex,
      );
      setAnalysis(result);
      setWeight('');
      await load();
    } catch (nextError) {
      const code = nextError instanceof ApiError ? nextError.code : undefined;
      const messages: Record<string, string> = {
        PROFILE_INCOMPLETE: 'กรุณากรอกวันเกิด ส่วนสูง และเป้าหมายในโปรไฟล์ให้ครบ (รองรับผู้ใหญ่อายุ 18 ปีขึ้นไป)',
        UNSUITABLE_PHOTO: 'รูปยังไม่เหมาะสำหรับวิเคราะห์ กรุณาใช้รูปเต็มลำตัวที่สว่าง ชัด และยืนตรง',
        IMAGE_TOO_LARGE: 'รูปมีขนาดเกิน 8 MB กรุณาเลือกรูปอื่น',
        UNSUPPORTED_IMAGE_TYPE: 'รองรับเฉพาะรูป JPEG, PNG และ WebP',
        AI_TIMEOUT: 'AI ใช้เวลานานเกินไป กรุณาลองอีกครั้ง',
        AI_NOT_CONFIGURED: 'ระบบ AI ยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์',
        AI_QUOTA_EXCEEDED: 'โควตา AI ไม่พร้อมใช้งานชั่วคราว กรุณาลองภายหลัง',
        ANALYSIS_RATE_LIMITED: 'วิเคราะห์รูปบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
      };
      setError(
        (code && messages[code]) ||
          'วิเคราะห์รูปไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตและลองอีกครั้ง',
      );
    } finally {
      setAnalyzing(false);
    }
  }

  const weights = data?.weightHistory ?? [];
  const balance = data?.calorieBalance;
  const balanceDifference = balance?.difference ?? null;
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
        <View className="mt-3 gap-3 sm:flex-row sm:items-center">
          <TextInput
            accessibilityLabel="น้ำหนักกิโลกรัม"
            className="min-h-12 rounded-xl border border-slate-300 px-3 text-slate-900 sm:flex-1"
            keyboardType="decimal-pad"
            placeholder="เช่น 70.5"
            value={weight}
            onChangeText={setWeight}
          />
          <View className="sm:flex-1">
            <ActionButton
              label={saving ? 'กำลังบันทึก...' : 'บันทึก'}
              disabled={saving}
              onPress={() => void addWeight()}
            />
          </View>
        </View>
      </Card>

      <SectionHeader title="AI วิเคราะห์ความคืบหน้ารูปร่าง" />
      <Card>
        <Text className="font-bold text-slate-950">
          รูปปัจจุบัน + น้ำหนัก
        </Text>
        <Text className="mt-2 text-sm leading-5 text-slate-500">
          ใช้รูปเต็มลำตัวที่สว่างและยืนตรง AI จะไม่วัดเปอร์เซ็นต์ไขมันหรือวินิจฉัยโรค และระบบจะไม่เก็บไฟล์รูปหลังวิเคราะห์
        </Text>
        <View className="mt-4 flex-row gap-2">
          {(['male', 'female'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setSex(value)}
              className={`min-h-11 flex-1 items-center justify-center rounded-xl border ${sex === value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300 bg-white'}`}
            >
              <Text className={sex === value ? 'font-bold text-emerald-800' : 'text-slate-700'}>
                {value === 'male' ? 'ชาย' : 'หญิง'}
              </Text>
            </Pressable>
          ))}
        </View>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            resizeMode="cover"
            className="mt-4 h-72 w-full rounded-2xl bg-slate-100"
          />
        ) : null}
        <View className="mt-4 gap-3">
          <ActionButton
            label={photo ? 'เปลี่ยนรูป' : 'เลือกรูปจากเครื่อง'}
            disabled={analyzing}
            onPress={() => void chooseProgressPhoto()}
          />
          {photo ? (
            <ActionButton
              label={analyzing ? 'AI กำลังวิเคราะห์...' : 'วิเคราะห์และบันทึกน้ำหนัก'}
              disabled={analyzing}
              onPress={() => void analyzePhoto()}
            />
          ) : null}
        </View>
        {analyzing ? (
          <View className="mt-5 items-center">
            <ActivityIndicator color="#059669" />
            <Text className="mt-2 text-sm text-slate-500">
              กำลังตรวจรูปและคำนวณเป้าหมายจากข้อมูลจริง...
            </Text>
          </View>
        ) : null}
      </Card>

      {analysis ? (
        <>
          <SectionHeader title="ผลวิเคราะห์ล่าสุด" />
          <Card>
            <Text className="text-center text-4xl font-black text-emerald-700">
              {analysis.nutrition.calories}
            </Text>
            <Text className="text-center text-slate-500">kcal ต่อวัน</Text>
            <View className="mt-4 gap-3 rounded-2xl bg-slate-50 p-4">
              <Text className="text-slate-700">โปรตีน {analysis.nutrition.protein_g} g</Text>
              <Text className="text-slate-700">คาร์บ {analysis.nutrition.carbs_g} g</Text>
              <Text className="text-slate-700">ไขมัน {analysis.nutrition.fat_g} g</Text>
            </View>
            <Text className="mt-4 text-sm text-slate-600">
              BMR {analysis.nutrition.bmr} · TDEE {analysis.nutrition.tdee} kcal
            </Text>
            <Text className="mt-1 text-sm text-slate-600">
              แนวโน้มตามเป้า {analysis.nutrition.weekly_weight_change_kg} กก./สัปดาห์
            </Text>
            <Text className="mt-5 font-bold text-slate-950">สิ่งที่สังเกตได้จากรูป</Text>
            {analysis.visual.observations.map((item) => (
              <Text key={item} className="mt-2 leading-5 text-slate-700">• {item}</Text>
            ))}
            <Text className="mt-5 font-bold text-slate-950">คำแนะนำ</Text>
            {analysis.visual.recommendations.map((item) => (
              <Text key={item} className="mt-2 leading-5 text-slate-700">• {item}</Text>
            ))}
            {analysis.visual.warnings.map((item) => (
              <Text key={item} className="mt-2 text-sm text-amber-700">• {item}</Text>
            ))}
            <Text className="mt-4 text-xs leading-4 text-slate-400">
              ผลจากรูปเป็นเพียงการสังเกตด้วย AI ตัวเลขโภชนาการคำนวณจากข้อมูลร่างกายและสูตรมาตรฐาน
            </Text>
          </Card>
        </>
      ) : null}

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
                width={Math.min(Dimensions.get('window').width - 64, 600)}
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

          <SectionHeader title={`สรุปพลังงาน ${days} วัน`} />
          <Card>
            {balanceDifference === null ? (
              <Text className="text-slate-500">
                ตั้งเป้าแคลอรีและบันทึกอาหารเพื่อดูยอดขาดหรือเกินสะสม
              </Text>
            ) : (
              <View className="gap-4">
                <View className={`rounded-2xl p-4 ${balanceDifference > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                  <Text className={`text-sm font-semibold ${balanceDifference > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {balanceDifference > 0 ? 'กินเกินเป้าสะสม' : balanceDifference < 0 ? 'กินต่ำกว่าเป้าสะสม' : 'กินตรงเป้าพอดี'}
                  </Text>
                  <Text className={`mt-1 text-3xl font-black ${balanceDifference > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                    {Math.abs(Math.round(balanceDifference)).toLocaleString('th-TH')} kcal
                  </Text>
                </View>

                <View className="gap-2">
                  <View className="flex-row justify-between gap-3">
                    <Text className="text-slate-500">กินทั้งหมด</Text>
                    <Text className="font-bold text-slate-900">{Math.round(balance?.totalConsumed ?? 0).toLocaleString('th-TH')} kcal</Text>
                  </View>
                  <View className="flex-row justify-between gap-3">
                    <Text className="text-slate-500">เป้ารวม ({balance?.daysTracked ?? 0} วันที่บันทึก)</Text>
                    <Text className="font-bold text-slate-900">{Math.round(balance?.totalTarget ?? 0).toLocaleString('th-TH')} kcal</Text>
                  </View>
                  <View className="flex-row justify-between gap-3">
                    <Text className="text-slate-500">ออกกำลังกาย</Text>
                    <Text className="font-bold text-sky-700">{Math.round(balance?.exerciseCalories ?? 0).toLocaleString('th-TH')} kcal</Text>
                  </View>
                </View>

                {(balance?.daily.length ?? 0) > 0 ? (
                  <View className="border-t border-slate-100 pt-3">
                    <Text className="mb-2 font-bold text-slate-900">รายวันล่าสุด</Text>
                    {balance?.daily.slice(-7).map((day) => (
                      <View key={day.date} className="flex-row items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
                        <Text className="text-sm text-slate-500">
                          {new Date(`${day.date}T12:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </Text>
                        <Text className={`text-sm font-bold ${day.difference === null ? 'text-slate-400' : day.difference > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {day.difference === null
                            ? `ออก ${Math.round(day.exerciseCalories)} kcal`
                            : `${day.difference > 0 ? 'เกิน' : day.difference < 0 ? 'ขาด' : 'ตรงเป้า'} ${Math.abs(Math.round(day.difference)).toLocaleString('th-TH')} kcal`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Text className="text-xs leading-5 text-slate-400">
                  นับเฉพาะวันที่มีบันทึกอาหาร วันที่ไม่มีข้อมูลจะไม่ถูกตีความว่ากิน 0 แคลอรี และแสดงพลังงานออกกำลังกายแยกเพื่อไม่ให้นับกิจกรรมซ้ำกับค่าเป้ารายวัน
                </Text>
              </View>
            )}
          </Card>

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
