import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from 'react-native';

import { ActionButton, Card } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';
import {
  createReminder,
  deleteReminder,
  fetchSettings,
  saveNutritionTargets,
  saveUnits,
  updateReminder,
  type ReminderRecord,
  type SettingsSnapshot,
  type Units,
} from '@/services/api/settings';
import { syncLocalReminders } from '@/services/reminders';

const titles: Record<string, string> = {
  goal: 'เป้าหมายโภชนาการ', workout: 'ความต้องการในการฝึก',
  reminders: 'การแจ้งเตือน', units: 'หน่วยวัด',
};

const numeric = (value: string) => Number(value.trim());

export default function SettingsScreen() {
  const { section = '' } = useLocalSearchParams<{ section: string }>();
  const { session } = useAuth();
  const { profile } = useProfile();
  const [data, setData] = useState<SettingsSnapshot | null>(null);
  const [targets, setTargets] = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newReminderTitle, setNewReminderTitle] = useState('บันทึกมื้ออาหาร');
  const [newReminderTime, setNewReminderTime] = useState('12:00');

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true); setError('');
    try {
      const snapshot = await fetchSettings(session.access_token);
      setData(snapshot);
      setTargets({
        calories: snapshot.targets.calories?.toString() ?? '',
        protein_g: snapshot.targets.protein_g?.toString() ?? '',
        carbs_g: snapshot.targets.carbs_g?.toString() ?? '',
        fat_g: snapshot.targets.fat_g?.toString() ?? '',
      });
    } catch { setError('โหลดการตั้งค่าไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  }, [session?.access_token]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<void>, success: string, syncReminders = false) {
    setSaving(true); setError(''); setMessage('');
    try {
      await action();
      if (syncReminders && session?.access_token) {
        const snapshot = await fetchSettings(session.access_token);
        setData(snapshot);
        try { await syncLocalReminders(snapshot.reminders); }
        catch { setMessage('บันทึกในบัญชีแล้ว แต่ยังไม่ได้รับสิทธิ์แจ้งเตือนบนอุปกรณ์'); return; }
      } else await load();
      setMessage(success);
    }
    catch { setError('บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSaving(false); }
  }

  async function chooseUnits(units: Units) {
    if (!session?.access_token) return;
    await run(() => saveUnits(session.access_token, units), 'บันทึกหน่วยวัดแล้ว');
  }

  async function saveTargets() {
    if (!session?.access_token) return;
    const values = {
      calories: numeric(targets.calories), protein_g: numeric(targets.protein_g),
      carbs_g: numeric(targets.carbs_g), fat_g: numeric(targets.fat_g),
    };
    if (!Number.isInteger(values.calories) || values.calories < 500 ||
      Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
      setError('กรุณากรอกเป้าหมายให้ถูกต้อง (พลังงานอย่างน้อย 500 kcal)'); return;
    }
    await run(() => saveNutritionTargets(session.access_token, values), 'บันทึกเป้าหมายแล้ว');
  }

  async function addReminder() {
    if (!session?.access_token) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newReminderTime) || !newReminderTitle.trim()) {
      setError('กรุณากรอกชื่อและเวลาในรูปแบบ HH:MM'); return;
    }
    await run(async () => { await createReminder(session.access_token, {
      type: 'meal', title: newReminderTitle.trim(), time: newReminderTime,
      days_of_week: [1, 2, 3, 4, 5, 6, 7], enabled: true,
    }); }, 'เพิ่มและตั้งเวลาการแจ้งเตือนแล้ว', true);
  }

  async function toggleReminder(item: ReminderRecord) {
    if (!session?.access_token) return;
    await run(async () => { await updateReminder(session.access_token, { ...item, enabled: !item.enabled }); }, 'อัปเดตเวลาการแจ้งเตือนแล้ว', true);
  }

  const input = (key: keyof typeof targets, label: string, suffix: string) => (
    <View className="gap-1">
      <Text className="text-sm font-medium text-slate-700">{label}</Text>
      <View className="flex-row items-center rounded-xl border border-slate-300 bg-white px-3">
        <TextInput className="min-h-12 flex-1 text-base text-slate-950" keyboardType="decimal-pad"
          value={targets[key]} onChangeText={(value) => setTargets((old) => ({ ...old, [key]: value }))} />
        <Text className="text-slate-500">{suffix}</Text>
      </View>
    </View>
  );

  return (
    <Screen title={titles[section] ?? 'การตั้งค่า'} subtitle="ค่าที่บันทึกจะซิงก์กับบัญชีของคุณ">
      <Pressable className="min-h-11 justify-center" onPress={() => router.back()}>
        <Text className="font-semibold text-emerald-700">‹ กลับ</Text>
      </Pressable>
      {loading ? <Card><ActivityIndicator color="#059669" /></Card> : null}
      {!loading && section === 'goal' ? <>
        <Card><Text className="text-sm text-slate-500">เป้าหมายหลักปัจจุบัน</Text>
          <Text className="mt-1 text-lg font-bold text-slate-950">{profile?.currentGoal?.goalType ?? 'ไม่ระบุ'}</Text></Card>
        <Card><View className="gap-3">{input('calories', 'พลังงานต่อวัน', 'kcal')}{input('protein_g', 'โปรตีน', 'g')}{input('carbs_g', 'คาร์โบไฮเดรต', 'g')}{input('fat_g', 'ไขมัน', 'g')}</View></Card>
        <ActionButton label={saving ? 'กำลังบันทึก...' : 'บันทึกเป้าหมาย'} disabled={saving} onPress={() => void saveTargets()} />
      </> : null}
      {!loading && section === 'units' ? <Card><View className="gap-3">
        {([['metric', 'เมตริก (กก./ซม.)'], ['imperial', 'อิมพีเรียล (ปอนด์/นิ้ว)']] as const).map(([value, label]) =>
          <Pressable key={value} className="min-h-14 flex-row items-center" disabled={saving} onPress={() => void chooseUnits(value)}>
            <View className={`mr-3 h-5 w-5 rounded-full border-2 ${data?.units === value ? 'border-[6px] border-emerald-600' : 'border-slate-300'}`} />
            <Text className="text-slate-800">{label}</Text>
          </Pressable>)}</View></Card> : null}
      {!loading && section === 'reminders' ? <>
        {data?.reminders.map((item) => <Card key={item.id}><View className="flex-row items-center gap-3">
          <View className="flex-1 gap-2">
            <TextInput accessibilityLabel="ชื่อการแจ้งเตือน" className="min-h-11 rounded-xl border border-slate-300 px-3 text-slate-900" value={item.title}
              onChangeText={(title) => setData((current) => current ? { ...current, reminders: current.reminders.map((value) => value.id === item.id ? { ...value, title } : value) } : current)} />
            <TextInput accessibilityLabel="เวลาแจ้งเตือน" className="min-h-11 rounded-xl border border-slate-300 px-3 text-slate-900" keyboardType="numbers-and-punctuation" value={item.time}
              onChangeText={(time) => setData((current) => current ? { ...current, reminders: current.reminders.map((value) => value.id === item.id ? { ...value, time } : value) } : current)} />
            <Text className="text-sm text-slate-500">ทุกวัน · {item.days_of_week.length} วัน/สัปดาห์</Text>
          </View>
          <Switch value={item.enabled} disabled={saving} onValueChange={() => void toggleReminder(item)} trackColor={{ true: '#10b981' }} />
        </View><View className="mt-3 flex-row gap-3">
          <Pressable className="min-h-11 flex-1 justify-center" onPress={() => session?.access_token && void run(() => updateReminder(session.access_token, item).then(() => undefined), 'บันทึกเวลาแจ้งเตือนแล้ว', true)}><Text className="font-medium text-emerald-700">บันทึก</Text></Pressable>
          <Pressable className="min-h-11 flex-1 justify-center" onPress={() => session?.access_token && void run(() => deleteReminder(session.access_token, item.id), 'ลบการแจ้งเตือนแล้ว', true)}><Text className="font-medium text-red-600">ลบ</Text></Pressable>
        </View></Card>)}
        <Card><Text className="mb-2 font-semibold text-slate-900">เพิ่มการแจ้งเตือน</Text>
          <TextInput accessibilityLabel="ชื่อการแจ้งเตือนใหม่" className="mb-2 min-h-12 rounded-xl border border-slate-300 px-3 text-slate-900" value={newReminderTitle} onChangeText={setNewReminderTitle} />
          <TextInput accessibilityLabel="เวลาแจ้งเตือนใหม่" className="min-h-12 rounded-xl border border-slate-300 px-3 text-slate-900" keyboardType="numbers-and-punctuation" value={newReminderTime} onChangeText={setNewReminderTime} />
        </Card>
        <ActionButton label="เพิ่มการแจ้งเตือนทุกวัน" disabled={saving} onPress={() => void addReminder()} />
        <Text className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">เวลาแจ้งเตือนบันทึกในบัญชีและซิงก์เป็น Local Notification บนอุปกรณ์นี้เมื่ออนุญาต Notifications</Text>
      </> : null}
      {!loading && section === 'workout' ? <Card><Text className="font-semibold text-slate-900">ค่าการฝึกที่บันทึกไว้</Text><Text className="mt-2 text-slate-600">สถานที่: {profile?.workoutPreferences?.trainingLocation ?? '-'}</Text><Text className="text-slate-600">ระดับ: {profile?.workoutPreferences?.experienceLevel ?? '-'}</Text><Text className="mt-3 text-sm text-amber-700">ฟิลด์นี้ยังไม่มี endpoint สำหรับแก้ไข จึงแสดงแบบอ่านอย่างเดียวเพื่อไม่เขียนทับข้อมูลเดิม</Text></Card> : null}
      {error ? <Text className="rounded-xl bg-red-50 p-3 text-red-700">{error}</Text> : null}
      {message ? <Text className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{message}</Text> : null}
      {error ? <ActionButton label="ลองโหลดใหม่" variant="secondary" onPress={() => void load()} /> : null}
    </Screen>
  );
}
