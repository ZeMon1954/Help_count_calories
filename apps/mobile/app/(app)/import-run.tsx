import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Card } from '@/components/ui/Kit';
import { useAuth } from '@/providers/AuthProvider';
import {
  analyzeRunScreenshot,
  importRun,
  type ActivityRecord,
} from '@/services/api/activity';
import { ApiError } from '@/services/api/client';
import type { LocalImage } from '@/services/api/food-analysis';
import {
  durationParts,
  parseRunInputs,
  type RunInputError,
} from '@/utils/run-import';

const errorMessages: Record<string, string> = {
  NOT_RUN_SUMMARY:
    'ไม่พบระยะทางและเวลาในรูป กรุณาใช้รูปหน้าสรุปจากแอปวิ่ง หรือกรอกเอง',
  IMAGE_TOO_LARGE: 'รูปมีขนาดใหญ่เกิน 8 MB กรุณาเลือกรูปอื่น',
  UNSUPPORTED_IMAGE_TYPE: 'รองรับเฉพาะรูป JPEG, PNG และ WebP',
  IMAGE_CONTENT_MISMATCH: 'ไฟล์รูปไม่ตรงกับชนิดไฟล์ กรุณาเลือกรูปใหม่',
  AI_TIMEOUT: 'ระบบอ่านรูปใช้เวลานานเกินไป กรุณาลองใหม่ หรือกรอกเอง',
  INVALID_AI_RESPONSE: 'อ่านค่าจากรูปไม่สำเร็จ กรุณาลองใหม่ หรือกรอกเอง',
  AI_PROVIDER_ERROR: 'บริการอ่านรูปขัดข้องชั่วคราว คุณกรอกข้อมูลเองได้',
  AI_QUOTA_EXCEEDED: 'โควตา Gemini ไม่พร้อมใช้งาน คุณกรอกข้อมูลเองได้',
  AI_NOT_CONFIGURED: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Gemini API Key',
  ANALYSIS_RATE_LIMITED: 'อ่านรูปบ่อยเกินไป กรุณารอสักครู่ หรือกรอกเอง',
};

const inputErrors: Record<Exclude<RunInputError, null>, string> = {
  distance: 'ระยะทางต้องอยู่ระหว่าง 0.1 - 100 กม.',
  duration: 'เวลาต้องอยู่ระหว่าง 1 นาที - 24 ชั่วโมง และเป็นตัวเลขเต็ม',
  speed: 'ระยะทางและเวลาไม่สมเหตุสมผลสำหรับการวิ่ง กรุณาตรวจสอบอีกครั้ง',
};

const MAX_IMAGE_SIDE = 1024;

async function optimizedImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<LocalImage> {
  const fallback = {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileName: asset.fileName ?? `run-${Date.now()}.jpg`,
  };
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    // The image is only read by the AI, never shown back, so keep it small:
    // fewer pixels means fewer Gemini tokens and a much lighter upload.
    if (Math.max(asset.width, asset.height) > MAX_IMAGE_SIDE) {
      if (asset.width >= asset.height)
        context.resize({ width: MAX_IMAGE_SIDE });
      else context.resize({ height: MAX_IMAGE_SIDE });
    }
    const saved = await (
      await context.renderAsync()
    ).saveAsync({
      compress: 0.6,
      format: SaveFormat.JPEG,
    });
    return {
      uri: saved.uri,
      mimeType: 'image/jpeg',
      fileName: `run-${Date.now()}.jpg`,
    };
  } catch {
    return fallback;
  }
}

function Field({
  label,
  value,
  onChangeText,
  unit,
  keyboardType = 'number-pad',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  unit?: string;
  keyboardType?: 'number-pad' | 'decimal-pad';
}) {
  return (
    <View className="flex-1">
      <Text className="text-sm text-slate-600">{label}</Text>
      <View className="mt-1 flex-row items-center rounded-xl border border-slate-300 px-3">
        <TextInput
          accessibilityLabel={label}
          className="min-h-12 flex-1 text-base text-slate-950"
          keyboardType={keyboardType}
          value={value}
          onChangeText={onChangeText}
        />
        {unit ? <Text className="text-sm text-slate-400">{unit}</Text> : null}
      </View>
    </View>
  );
}

export default function ImportRunScreen() {
  const { session } = useAuth();
  const [image, setImage] = useState<LocalImage | null>(null);
  const [distanceKm, setDistanceKm] = useState('');
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('0');
  const [daysAgo, setDaysAgo] = useState<0 | 1>(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ActivityRecord | null>(null);

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'ต้องใช้สิทธิ์คลังภาพ',
        'กรุณาอนุญาตการเข้าถึงรูปภาพเพื่อเลือกภาพสรุปการวิ่ง',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets[0] || !session?.access_token) return;
    setAnalyzing(true);
    setError(null);
    setWarnings([]);
    setConfidence(null);
    try {
      const picked = await optimizedImage(result.assets[0]);
      setImage(picked);
      const summary = await analyzeRunScreenshot(session.access_token, picked);
      const duration = durationParts(summary.duration_seconds);
      setDistanceKm(String(Math.round(summary.distance_m / 10) / 100));
      setHours(duration.hours);
      setMinutes(duration.minutes);
      setSeconds(duration.seconds);
      setWarnings(summary.warnings);
      setConfidence(
        { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' }[summary.confidence],
      );
    } catch (nextError) {
      setError(
        nextError instanceof ApiError
          ? ((nextError.code && errorMessages[nextError.code]) ??
              nextError.message)
          : 'อ่านรูปไม่สำเร็จ กรุณาลองใหม่ หรือกรอกเอง',
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    if (!session?.access_token || saving) return;
    const parsed = parseRunInputs({ distanceKm, hours, minutes, seconds });
    if (parsed.error) {
      setError(inputErrors[parsed.error]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSaved(
        await importRun(session.access_token, {
          distance_m: parsed.distanceM,
          duration_seconds: parsed.durationSeconds,
          ended_at: new Date(
            Date.now() - daysAgo * 24 * 3_600_000,
          ).toISOString(),
        }),
      );
    } catch (nextError) {
      setError(
        nextError instanceof ApiError && nextError.status === 400
          ? 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบระยะทางและเวลา'
          : 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      );
    } finally {
      setSaving(false);
    }
  }

  const busy = analyzing || saving;

  return (
    <SafeAreaView className="flex-1 bg-[#f3f8f5]">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="mx-auto w-full max-w-xl gap-5 px-5 pb-12 pt-4"
        >
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center"
            onPress={() => router.replace('/activity')}
          >
            <Text className="font-semibold text-emerald-700">‹ กลับ</Text>
          </Pressable>

          <View>
            <Text className="text-3xl font-extrabold tracking-tight text-slate-950">
              เพิ่มผลการวิ่งจากรูป
            </Text>
            <Text className="mt-2 leading-6 text-slate-500">
              เลือกรูปหน้าสรุปจาก Strava, Garmin, Nike Run Club หรือแอปวิ่งอื่น
              ระบบจะอ่านระยะทางและเวลา แล้วคำนวณเพซและแคลอรีจากน้ำหนักตัวของคุณ
            </Text>
          </View>

          {saved ? (
            <Card>
              <Text className="text-xs font-semibold text-emerald-700">
                บันทึกการวิ่งแล้ว
              </Text>
              <Text className="mt-3 text-4xl font-bold text-slate-950">
                {Math.round(saved.calories)}
                <Text className="text-base font-medium"> kcal</Text>
              </Text>
              <Text className="mt-2 text-sm text-slate-600">
                {(saved.distanceM / 1000).toFixed(2)} กม. •{' '}
                {Math.floor(saved.elapsedSeconds / 60)} นาที
                {saved.elapsedSeconds % 60} วินาที
              </Text>
              <View className="mt-5">
                <ActionButton
                  label="ไปที่หน้ากิจกรรม"
                  onPress={() => router.replace('/activity')}
                />
              </View>
            </Card>
          ) : (
            <>
              {image ? (
                <Image
                  accessibilityLabel="รูปสรุปการวิ่งที่เลือก"
                  className="aspect-[3/4] w-full rounded-3xl bg-slate-200"
                  resizeMode="contain"
                  source={{ uri: image.uri }}
                />
              ) : null}

              <ActionButton
                label={
                  analyzing
                    ? 'กำลังอ่านรูป...'
                    : image
                      ? 'เลือกรูปใหม่'
                      : 'เลือกรูปสรุปการวิ่ง'
                }
                onPress={() => void choosePhoto()}
                disabled={busy}
              />
              {analyzing ? (
                <View className="items-center gap-2">
                  <ActivityIndicator color="#10b981" />
                  <Text className="text-sm text-slate-500">
                    อาจใช้เวลาประมาณ 10–30 วินาที
                  </Text>
                </View>
              ) : null}

              {error ? (
                <View className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <Text className="leading-5 text-red-700">{error}</Text>
                </View>
              ) : null}

              <Card>
                {confidence ? (
                  <Text className="mb-3 text-xs font-semibold text-amber-700">
                    อ่านจากรูปโดย AI • ความมั่นใจ{confidence} •
                    กรุณาตรวจสอบตัวเลขก่อนบันทึก
                  </Text>
                ) : (
                  <Text className="mb-3 text-xs text-slate-500">
                    ไม่มีรูป? กรอกระยะทางและเวลาเองได้
                  </Text>
                )}
                <Field
                  label="ระยะทาง"
                  unit="กม."
                  keyboardType="decimal-pad"
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                />
                <Text className="mt-4 text-sm text-slate-600">
                  เวลาที่วิ่ง (Moving Time)
                </Text>
                <View className="mt-1 flex-row gap-2">
                  <Field
                    label="ชั่วโมง"
                    value={hours}
                    onChangeText={setHours}
                  />
                  <Field
                    label="นาที"
                    value={minutes}
                    onChangeText={setMinutes}
                  />
                  <Field
                    label="วินาที"
                    value={seconds}
                    onChangeText={setSeconds}
                  />
                </View>
                <Text className="mt-4 text-sm text-slate-600">วันที่วิ่ง</Text>
                <View className="mt-1 flex-row gap-2">
                  {(
                    [
                      [0, 'วันนี้'],
                      [1, 'เมื่อวาน'],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      className={`min-h-11 justify-center rounded-full px-4 ${daysAgo === value ? 'bg-emerald-600' : 'border border-slate-300'}`}
                      onPress={() => setDaysAgo(value)}
                    >
                      <Text
                        className={`font-semibold ${daysAgo === value ? 'text-white' : 'text-slate-700'}`}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Card>

              {warnings.length > 0 ? (
                <View className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  {warnings.map((warning) => (
                    <Text key={warning} className="leading-5 text-amber-800">
                      • {warning}
                    </Text>
                  ))}
                </View>
              ) : null}

              <ActionButton
                label={
                  saving ? 'กำลังคำนวณและบันทึก...' : 'คำนวณแคลอรี่และบันทึก'
                }
                onPress={() => void save()}
                disabled={busy}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
