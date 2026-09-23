import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
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
import { ApiError } from '@/services/api/client';
import {
  analyzeFoodPhoto,
  type FoodAnalysisResult,
  type LocalImage,
} from '@/services/api/food-analysis';
import {
  createClientRequestId,
  createCustomFood,
  logCatalogFood,
  searchFoods,
  type MealType,
} from '@/services/api/food';

function normalizeFoodName(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('th-TH').replace(/[\s()[\]{}.,/\\_-]+/g, '');
}

function findCatalogMatch<T extends { name: string }>(items: T[], name: string) {
  const wanted = normalizeFoodName(name);
  return items.find((item) => {
    const candidate = normalizeFoodName(item.name);
    if (candidate === wanted) return true;
    const shorter = Math.min(candidate.length, wanted.length);
    const longer = Math.max(candidate.length, wanted.length);
    return shorter >= 6 && shorter / longer >= 0.8 &&
      (candidate.includes(wanted) || wanted.includes(candidate));
  });
}
import { scaleAnalysisItem, totalAnalysisItems } from '@/utils/food-analysis';

function thaiError(error: unknown) {
  if (!(error instanceof ApiError))
    return 'วิเคราะห์รูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
  const messages: Record<string, string> = {
    NOT_FOOD: 'ไม่พบอาหารในภาพ กรุณาถ่ายรูปอาหารให้ชัดเจนแล้วลองใหม่',
    IMAGE_TOO_LARGE: 'รูปมีขนาดใหญ่เกิน 8 MB กรุณาเลือกรูปอื่น',
    UNSUPPORTED_IMAGE_TYPE: 'รองรับเฉพาะรูป JPEG, PNG และ WebP',
    IMAGE_CONTENT_MISMATCH: 'ไฟล์รูปไม่ตรงกับชนิดไฟล์ กรุณาเลือกรูปใหม่',
    AI_TIMEOUT: 'ระบบวิเคราะห์ใช้เวลานานเกินไป กรุณาลองใหม่',
    INVALID_AI_RESPONSE: 'ผลวิเคราะห์ไม่สมบูรณ์ กรุณาลองวิเคราะห์รูปใหม่',
    AI_PROVIDER_ERROR: 'บริการวิเคราะห์ขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง',
    AI_QUOTA_EXCEEDED:
      'โควตา Gemini ไม่พร้อมใช้งาน กรุณาตรวจสอบ Billing หรือ Rate Limit ใน Google AI Studio',
    AI_NOT_CONFIGURED: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Gemini API Key',
    ANALYSIS_RATE_LIMITED: 'วิเคราะห์รูปบ่อยเกินไป กรุณารอสักครู่',
  };
  return (error.code && messages[error.code]) || error.message;
}

function localImage(asset: ImagePicker.ImagePickerAsset): LocalImage {
  const extension = asset.uri.split('.').pop()?.toLowerCase();
  const fallbackMime =
    extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? fallbackMime,
    fileName: asset.fileName ?? `food-${Date.now()}.${extension ?? 'jpg'}`,
  };
}

async function optimizedLocalImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<LocalImage> {
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    const longestSide = Math.max(asset.width, asset.height);
    if (longestSide > 1600) {
      if (asset.width >= asset.height) context.resize({ width: 1600 });
      else context.resize({ height: 1600 });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      compress: 0.72,
      format: SaveFormat.JPEG,
    });
    return {
      uri: saved.uri,
      mimeType: 'image/jpeg',
      fileName: `food-${Date.now()}.jpg`,
    };
  } catch {
    return localImage(asset);
  }
}

export default function FoodScannerScreen() {
  const { session } = useAuth();
  const [image, setImage] = useState<LocalImage | null>(null);
  const [analysis, setAnalysis] = useState<FoodAnalysisResult | null>(null);
  const [foodName, setFoodName] = useState('');
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [meal, setMeal] = useState<MealType>('lunch');
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null);

  const editedItems = useMemo(
    () =>
      analysis?.items.map((item, index) => {
        const quantity = Number(quantities[index]);
        return {
          ...scaleAnalysisItem(item, quantity),
          name: itemNames[index]?.trim() || item.name,
        };
      }) ?? [],
    [analysis, itemNames, quantities],
  );
  const total = useMemo(() => totalAnalysisItems(editedItems), [editedItems]);

  async function acceptAsset(asset: ImagePicker.ImagePickerAsset) {
    setLoading(true);
    setImage(await optimizedLocalImage(asset));
    setAnalysis(null);
    setError(null);
    setLoading(false);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'ต้องใช้สิทธิ์กล้อง',
        'กรุณาอนุญาตการใช้กล้องในการตั้งค่า iPhone เพื่อถ่ายรูปอาหาร',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) void acceptAsset(result.assets[0]);
  }

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'ต้องใช้สิทธิ์คลังภาพ',
        'กรุณาอนุญาตการเข้าถึงรูปภาพเพื่อเลือกรูปอาหาร',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      selectionLimit: 1,
    });
    if (!result.canceled && result.assets[0]) void acceptAsset(result.assets[0]);
  }

  async function analyze() {
    if (!image || !session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const next = await analyzeFoodPhoto(session.access_token, image);
      setAnalysis(next);
      setFoodName(next.food_name);
      setItemNames(next.items.map((item) => item.name));
      setQuantities(
        next.items.map((item) => String(item.estimated_quantity_g)),
      );
    } catch (nextError) {
      setError(thaiError(nextError));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setImage(null);
    setAnalysis(null);
    setFoodName('');
    setItemNames([]);
    setQuantities([]);
    setError(null);
  }

  async function saveToDiary() {
    if (!analysis || !session?.access_token || saving) return;
    const name = foodName.trim();
    const quantityG = editedItems.reduce(
      (sum, item) => sum + item.estimated_quantity_g,
      0,
    );
    if (!name || quantityG <= 0) {
      setError('กรุณาตรวจสอบชื่ออาหารและปริมาณก่อนบันทึก');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const catalog = await searchFoods(session.access_token, name, 20);
      let matched = findCatalogMatch(catalog.items, name);
      if (!matched) {
        matched = await createCustomFood(session.access_token, {
          name,
          serving_size_g: quantityG,
          calories: total.calories,
          protein_g: total.protein_g,
          carbs_g: total.carbs_g,
          fat_g: total.fat_g,
        });
      }
      const signature = JSON.stringify([matched.id, meal, quantityG]);
      if (pendingRequest.current?.signature !== signature)
        pendingRequest.current = {
          signature,
          id: createClientRequestId(),
        };
      await logCatalogFood(session.access_token, {
        food_id: matched.id,
        meal_type: meal,
        quantity_g: quantityG,
        eaten_at: new Date().toISOString(),
        client_request_id: pendingRequest.current.id,
      });
      pendingRequest.current = null;
      router.replace('/food');
    } catch (nextError) {
      setError(
        nextError instanceof ApiError && nextError.code === 'IDEMPOTENT_ITEM_DELETED'
          ? 'รายการเดิมถูกลบแล้ว กรุณาวิเคราะห์และบันทึกใหม่'
          : 'บันทึกลง Diary ไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setSaving(false);
    }
  }

  const confidence = analysis
    ? { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' }[analysis.confidence]
    : '';

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="mx-auto w-full max-w-xl gap-5 px-5 pb-12 pt-4"
        >
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center"
              onPress={() => router.back()}
            >
              <Text className="font-semibold text-white">‹ กลับ</Text>
            </Pressable>
            <View className="rounded-full bg-emerald-400/15 px-3 py-1.5">
              <Text className="text-xs font-semibold text-emerald-300">
                วิเคราะห์ด้วย AI จริง
              </Text>
            </View>
          </View>

          <View>
            <Text className="text-3xl font-bold text-white">
              วิเคราะห์อาหารจากรูป
            </Text>
            <Text className="mt-2 leading-5 text-slate-400">
              ถ่ายให้เห็นอาหารทั้งจานและมีแสงเพียงพอ ผลโภชนาการเป็นค่าประมาณ
              ควรตรวจสอบก่อนนำไปใช้
            </Text>
          </View>

          {image ? (
            <Image
              accessibilityLabel="รูปอาหารที่เลือก"
              className="aspect-[4/3] w-full rounded-3xl bg-slate-900"
              resizeMode="cover"
              source={{ uri: image.uri }}
            />
          ) : (
            <View className="aspect-[4/3] items-center justify-center rounded-3xl border-2 border-dashed border-slate-700 bg-slate-900 px-6">
              <Text className="text-5xl">📷</Text>
              <Text className="mt-3 text-center font-semibold text-white">
                จัดอาหารให้อยู่กลางภาพ
              </Text>
              <Text className="mt-1 text-center text-sm text-slate-400">
                หลีกเลี่ยงภาพมืด ภาพเบลอ หรือมีสิ่งบดบังอาหาร
              </Text>
            </View>
          )}

          {!analysis && (
            <View className="gap-3">
              <ActionButton
                label={image ? 'ถ่ายรูปใหม่' : 'เปิดกล้องถ่ายอาหาร'}
                onPress={() => void takePhoto()}
                disabled={loading}
              />
              <ActionButton
                label="เลือกจากคลังภาพ"
                variant="secondary"
                onPress={() => void choosePhoto()}
                disabled={loading}
              />
              {image && (
                <ActionButton
                  label="เริ่มวิเคราะห์"
                  onPress={() => void analyze()}
                  disabled={loading}
                />
              )}
            </View>
          )}

          {loading && (
            <Card>
              <View className="items-center gap-3 py-5">
                <ActivityIndicator size="large" color="#059669" />
                <Text className="font-semibold text-slate-900">
                  กำลังวิเคราะห์อาหาร…
                </Text>
                <Text className="text-center text-sm text-slate-500">
                  อาจใช้เวลาประมาณ 15–60 วินาที กรุณาอย่าปิดหน้านี้
                </Text>
              </View>
            </Card>
          )}

          {error && !loading && (
            <View className="gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <Text className="font-bold text-red-800">วิเคราะห์ไม่สำเร็จ</Text>
              <Text className="leading-5 text-red-700">{error}</Text>
              <ActionButton
                label="ลองวิเคราะห์อีกครั้ง"
                variant="danger"
                onPress={() => void analyze()}
                disabled={!image}
              />
            </View>
          )}

          {analysis && !loading && (
            <>
              <Card>
                <Text className="text-xs font-semibold text-amber-700">
                  ค่าประมาณจาก AI • ความมั่นใจ{confidence}
                </Text>
                <Text className="mt-4 text-sm font-medium text-slate-600">
                  ชื่ออาหาร
                </Text>
                <TextInput
                  accessibilityLabel="ชื่ออาหาร"
                  className="mt-1 min-h-12 rounded-xl border border-slate-300 px-3 text-base text-slate-950"
                  value={foodName}
                  maxLength={160}
                  onChangeText={setFoodName}
                />
                <View className="mt-5 flex-row items-end justify-between">
                  <View>
                    <Text className="text-sm text-slate-500">
                      พลังงานรวมโดยประมาณ
                    </Text>
                    <Text className="text-4xl font-bold text-slate-950">
                      {Math.round(total.calories)}
                      <Text className="text-base font-medium"> kcal</Text>
                    </Text>
                  </View>
                </View>
                <View className="mt-4 flex-row gap-2">
                  {[
                    ['โปรตีน', total.protein_g],
                    ['คาร์บ', total.carbs_g],
                    ['ไขมัน', total.fat_g],
                  ].map(([label, value]) => (
                    <View
                      key={String(label)}
                      className="flex-1 rounded-xl bg-slate-100 p-3"
                    >
                      <Text className="text-xs text-slate-500">{label}</Text>
                      <Text className="mt-1 font-bold text-slate-900">
                        {Number(value).toFixed(1)} g
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              <View className="gap-3">
                <Text className="text-xl font-bold text-white">
                  อาหารที่ตรวจพบ
                </Text>
                {editedItems.map((item, index) => (
                  <Card key={`${analysis.items[index]!.name}-${index}`}>
                    <View className="flex-row items-start justify-between gap-3">
                      <TextInput
                        accessibilityLabel={`ชื่ออาหารรายการที่ ${index + 1}`}
                        className="min-h-12 flex-1 rounded-xl border border-slate-300 px-3 text-base font-bold text-slate-950"
                        value={itemNames[index] ?? ''}
                        maxLength={120}
                        onChangeText={(value) =>
                          setItemNames((current) =>
                            current.map((name, nameIndex) =>
                              nameIndex === index ? value : name,
                            ),
                          )
                        }
                      />
                      <Text className="font-semibold text-emerald-700">
                        {Math.round(item.calories)} kcal
                      </Text>
                    </View>
                    <Text className="mt-1 text-xs text-slate-500">
                      โภชนาการจาก AI estimate ไม่ได้จับคู่ฐานข้อมูลอาหาร
                    </Text>
                    <View className="mt-3">
                      <Text className="text-sm text-slate-600">
                        ปริมาณโดยประมาณ (กรัม)
                      </Text>
                      <TextInput
                        accessibilityLabel={`ปริมาณ ${item.name}`}
                        className="mt-1 min-h-12 rounded-xl border border-slate-300 px-3 text-slate-950"
                        keyboardType="decimal-pad"
                        value={quantities[index] ?? ''}
                        onChangeText={(value) =>
                          setQuantities((current) =>
                            current.map((quantity, quantityIndex) =>
                              quantityIndex === index ? value : quantity,
                            ),
                          )
                        }
                        onBlur={() =>
                          setQuantities((current) =>
                            current.map((quantity, quantityIndex) =>
                              quantityIndex === index
                                ? String(item.estimated_quantity_g)
                                : quantity,
                            ),
                          )
                        }
                      />
                    </View>
                    <Text className="mt-3 text-sm text-slate-600">
                      โปรตีน {item.protein_g.toFixed(1)} g • คาร์บ{' '}
                      {item.carbs_g.toFixed(1)} g • ไขมัน{' '}
                      {item.fat_g.toFixed(1)} g
                    </Text>
                  </Card>
                ))}
              </View>

              {analysis.warnings.length > 0 && (
                <View className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <Text className="font-bold text-amber-900">
                    ข้อจำกัดของผลวิเคราะห์
                  </Text>
                  {analysis.warnings.map((warning) => (
                    <Text
                      key={warning}
                      className="mt-2 leading-5 text-amber-800"
                    >
                      • {warning}
                    </Text>
                  ))}
                </View>
              )}

              <View className="gap-3">
                <Text className="font-semibold text-white">เลือกมื้ออาหาร</Text>
                <View className="flex-row flex-wrap gap-2">
                  {(
                    [
                      ['breakfast', 'เช้า'],
                      ['lunch', 'กลางวัน'],
                      ['dinner', 'เย็น'],
                      ['snack', 'ของว่าง'],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      className={`min-h-11 justify-center rounded-full px-4 ${meal === value ? 'bg-emerald-600' : 'border border-slate-600'}`}
                      onPress={() => setMeal(value)}
                    >
                      <Text className="font-semibold text-white">{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <ActionButton
                  label={saving ? 'กำลังบันทึกลง Diary...' : 'บันทึกลง Diary'}
                  disabled={saving}
                  onPress={() => void saveToDiary()}
                />
                <ActionButton label="วิเคราะห์รูปใหม่" onPress={reset} />
                <ActionButton
                  label="กลับไป Food Diary โดยไม่บันทึก"
                  variant="secondary"
                  onPress={() => router.replace('/food')}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
