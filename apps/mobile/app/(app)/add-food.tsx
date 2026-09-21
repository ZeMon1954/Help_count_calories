import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActionButton,
  Card,
  EmptyState,
  SectionHeader,
} from '@/components/ui/Kit';
import { useAuth } from '@/providers/AuthProvider';
import {
  createCustomFood,
  createClientRequestId,
  logCatalogFood,
  fetchFavoriteFoods,
  fetchRecentFoods,
  setFoodFavorite,
  searchFoods,
  type FoodRecord,
  type MealType,
} from '@/services/api/food';

const mealLabels: Record<MealType, string> = {
  breakfast: 'มื้อเช้า',
  lunch: 'มื้อกลางวัน',
  dinner: 'มื้อเย็น',
  snack: 'ของว่าง',
};

function NumericField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View className="flex-1 gap-1">
      <Text className="text-sm text-slate-600">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-slate-900"
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string }>();
  const { session } = useAuth();
  const initialMeal =
    params.meal && params.meal in mealLabels
      ? (params.meal as MealType)
      : 'breakfast';
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<FoodRecord[]>([]);
  const [favorites, setFavorites] = useState<FoodRecord[]>([]);
  const [recent, setRecent] = useState<FoodRecord[]>([]);
  const [selected, setSelected] = useState<FoodRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const pendingRequest = useRef<{ signature: string; id: string } | null>(null);
  const [manual, setManual] = useState({
    name: '',
    serving_size_g: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });

  const loadCatalog = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setMessage('');
    try {
      const [result,nextFavorites,nextRecent] = await Promise.all([searchFoods(session.access_token, query),fetchFavoriteFoods(session.access_token),fetchRecentFoods(session.access_token)]);
      setFoods(result.items);
      setFavorites(nextFavorites);setRecent(nextRecent);
    } catch {
      setMessage('โหลด Food Catalog ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [query, session?.access_token]);

  useEffect(() => {
    const timer = setTimeout(() => void loadCatalog(), 250);
    return () => clearTimeout(timer);
  }, [loadCatalog]);

  async function saveCustomFood() {
    if (!session?.access_token || saving) return;
    const values = {
      name: manual.name.trim(),
      serving_size_g: Number(manual.serving_size_g),
      calories: Number(manual.calories),
      protein_g: Number(manual.protein_g || 0),
      carbs_g: Number(manual.carbs_g || 0),
      fat_g: Number(manual.fat_g || 0),
    };
    if (
      !values.name ||
      !manual.serving_size_g.trim() ||
      values.serving_size_g <= 0 ||
      !manual.calories.trim() ||
      values.calories < 0 ||
      [values.protein_g, values.carbs_g, values.fat_g].some(
        (value) => !Number.isFinite(value) || value < 0,
      )
    ) {
      setMessage('กรุณากรอกชื่อ ปริมาณ และสารอาหารให้ถูกต้อง');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const created = await createCustomFood(session.access_token, values);
      setSelected(created);
      setQuantity(String(created.serving_size_g));
      setManualMode(false);
      setFoods((current) => [created, ...current]);
      setMessage('บันทึกอาหารส่วนตัวใน Catalog แล้ว แต่ยังไม่ได้เพิ่มลง Diary');
    } catch {
      setMessage('บันทึกอาหารส่วนตัวไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function addToDiary() {
    if (!session?.access_token || !selected || saving) return;
    const quantityG = Number(quantity);
    if (!Number.isFinite(quantityG) || quantityG <= 0 || quantityG > 100_000) {
      setMessage('กรุณาระบุปริมาณอาหารเป็นกรัมให้ถูกต้อง');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const signature = JSON.stringify([selected.id, meal, quantityG]);
      if (pendingRequest.current?.signature !== signature)
        pendingRequest.current = {
          signature,
          id: createClientRequestId(),
        };
      await logCatalogFood(session.access_token, {
        food_id: selected.id,
        meal_type: meal,
        quantity_g: quantityG,
        eaten_at: new Date().toISOString(),
        client_request_id: pendingRequest.current.id,
      });
      pendingRequest.current = null;
      router.replace('/food');
    } catch {
      setMessage('เพิ่มอาหารลง Diary ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
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
            className="min-h-11 justify-center self-start"
            onPress={() => router.back()}
          >
            <Text className="font-semibold text-slate-700">‹ กลับ</Text>
          </Pressable>
          <View>
            <Text className="text-3xl font-bold text-slate-950">
              เลือกอาหาร
            </Text>
            <Text className="mt-1 text-slate-500">
              เลือกอาหารและปริมาณเพื่อบันทึกลง Diary
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {(Object.keys(mealLabels) as MealType[]).map((value) => (
                <Pressable
                  key={value}
                  className={`min-h-11 justify-center rounded-full px-4 ${meal === value ? 'bg-emerald-600' : 'border border-slate-300 bg-white'}`}
                  onPress={() => setMeal(value)}
                >
                  <Text
                    className={meal === value ? 'text-white' : 'text-slate-700'}
                  >
                    {mealLabels[value]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {!manualMode ? (
            <>
              {!query && favorites.length ? <><SectionHeader title="รายการโปรด" />{favorites.slice(0,3).map(food=><Pressable key={`fav-${food.id}`} className="rounded-2xl border border-amber-300 bg-white p-4" onPress={()=>{setSelected(food);setQuantity(String(food.serving_size_g));}}><Text className="font-semibold text-slate-900">★ {food.name}</Text></Pressable>)}</>:null}
              {!query && recent.length ? <><SectionHeader title="รายการล่าสุด" />{recent.slice(0,3).map(food=><Pressable key={`recent-${food.id}`} className="rounded-2xl border border-slate-200 bg-white p-4" onPress={()=>{setSelected(food);setQuantity(String(food.serving_size_g));}}><Text className="font-semibold text-slate-900">{food.name}</Text></Pressable>)}</>:null}
              <TextInput
                accessibilityLabel="ค้นหาอาหาร"
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950"
                placeholder="ค้นหาอาหารจาก Catalog..."
                placeholderTextColor="#94a3b8"
                value={query}
                onChangeText={setQuery}
              />
              <SectionHeader title="Food Catalog" />
              {loading ? (
                <ActivityIndicator color="#059669" />
              ) : foods.length ? (
                foods.map((food) => (
                  <Pressable
                    key={food.id}
                    className={`rounded-2xl border bg-white p-4 ${selected?.id === food.id ? 'border-emerald-600' : 'border-slate-200'}`}
                    onPress={() => {
                      setSelected(food);
                      setQuantity(String(food.serving_size_g));
                    }}
                  >
                    <View className="flex-row justify-between gap-3">
                      <View className="flex-1">
                        <Text className="font-semibold text-slate-900">
                          {food.name}
                        </Text>
                        <Text className="mt-1 text-sm text-slate-500">
                          ต่อ {food.serving_size_g} กรัม ·{' '}
                          {food.created_by ? 'อาหารส่วนตัว' : 'อาหารส่วนกลาง'}
                        </Text>
                      </View>
                      <Text className="font-semibold text-slate-700">
                        {food.calories} kcal
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <EmptyState
                  title="ยังไม่มีอาหารใน Catalog"
                  description="ฐานข้อมูลยังว่าง คุณสามารถสร้างอาหารส่วนตัวได้"
                />
              )}

              {selected ? (
                <Card>
                  <Text className="text-lg font-bold text-slate-950">
                    {selected.name}
                  </Text>
                  <Text className="mt-2 text-sm text-slate-600">
                    โปรตีน {selected.protein_g}g · คาร์บ {selected.carbs_g}g ·
                    ไขมัน {selected.fat_g}g ต่อ {selected.serving_size_g} กรัม
                  </Text>
                  <View className="mt-4">
                    <NumericField
                      label="ปริมาณที่กิน (กรัม)"
                      value={quantity}
                      onChange={setQuantity}
                    />
                  </View>
                  <View className="mt-2"><ActionButton label={favorites.some(food=>food.id===selected.id)?'นำออกจากรายการโปรด':'เพิ่มในรายการโปรด'} variant="secondary" onPress={async()=>{if(!session?.access_token)return;const next=!favorites.some(food=>food.id===selected.id);await setFoodFavorite(session.access_token,selected.id,next);await loadCatalog();}} /></View>
                  <View className="mt-4">
                    <ActionButton
                      label={saving ? 'กำลังบันทึก...' : `บันทึกลง ${mealLabels[meal]}`}
                      disabled={saving}
                      onPress={() => void addToDiary()}
                    />
                  </View>
                </Card>
              ) : null}

              <ActionButton
                label="สร้างอาหารส่วนตัว"
                variant="secondary"
                onPress={() => setManualMode(true)}
              />
            </>
          ) : (
            <Card>
              <Text className="text-xl font-bold text-slate-950">
                สร้างอาหารส่วนตัว
              </Text>
              <TextInput
                accessibilityLabel="ชื่ออาหาร"
                className="mt-3 min-h-12 rounded-xl border border-slate-300 px-3 text-slate-900"
                placeholder="ชื่ออาหาร"
                value={manual.name}
                onChangeText={(value) =>
                  setManual((current) => ({ ...current, name: value }))
                }
              />
              <View className="mt-3 flex-row gap-2">
                <NumericField
                  label="หนึ่งหน่วย (กรัม)"
                  value={manual.serving_size_g}
                  onChange={(value) =>
                    setManual((current) => ({
                      ...current,
                      serving_size_g: value,
                    }))
                  }
                />
                <NumericField
                  label="แคลอรีต่อหน่วย"
                  value={manual.calories}
                  onChange={(value) =>
                    setManual((current) => ({ ...current, calories: value }))
                  }
                />
              </View>
              <View className="mt-3 flex-row gap-2">
                {(['protein_g', 'carbs_g', 'fat_g'] as const).map((key) => (
                  <NumericField
                    key={key}
                    label={
                      key === 'protein_g'
                        ? 'โปรตีน'
                        : key === 'carbs_g'
                          ? 'คาร์บ'
                          : 'ไขมัน'
                    }
                    value={manual[key]}
                    onChange={(value) =>
                      setManual((current) => ({ ...current, [key]: value }))
                    }
                  />
                ))}
              </View>
              <View className="mt-4 gap-2">
                <ActionButton
                  label={saving ? 'กำลังบันทึก...' : 'บันทึกใน Catalog จริง'}
                  disabled={saving}
                  onPress={() => void saveCustomFood()}
                />
                <ActionButton
                  label="ยกเลิก"
                  variant="secondary"
                  onPress={() => setManualMode(false)}
                />
              </View>
            </Card>
          )}

          {message ? (
            <Text className="rounded-xl bg-amber-50 p-3 text-amber-800">
              {message}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
