import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ActionButton, Card, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { useProfile } from '@/providers/ProfileProvider';

const labels = {
  goal: {
    lose_fat: 'ลดไขมัน',
    build_muscle: 'เพิ่มกล้ามเนื้อ',
    maintain: 'รักษาน้ำหนัก',
  },
  activity: {
    sedentary: 'ไม่ค่อยเคลื่อนไหว',
    lightly_active: 'เคลื่อนไหวเล็กน้อย',
    moderately_active: 'เคลื่อนไหวปานกลาง',
    very_active: 'เคลื่อนไหวมาก',
  },
} as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4">
      <Text className="text-sm text-slate-500">{label}</Text>
      <Text className="font-medium text-slate-900 sm:flex-1 sm:text-right">
        {value}
      </Text>
    </View>
  );
}

const settings = [
  {
    section: 'personal',
    title: 'ข้อมูลส่วนตัว',
    detail: 'ชื่อ วันเกิด ส่วนสูง และระดับกิจกรรม',
  },
  {
    section: 'goal',
    title: 'เป้าหมายสุขภาพ',
    detail: 'เป้าหมายหลักและสารอาหาร',
  },
  { section: 'reminders', title: 'การแจ้งเตือน', detail: 'เวลาอาหารและการชั่งน้ำหนัก' },
  { section: 'units', title: 'หน่วยวัด', detail: 'เมตริกหรืออิมพีเรียล' },
] as const;

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const [loggingOut, setLoggingOut] = useState(false);

  // Signing out clears the profile one render before (app)/_layout swaps the
  // tabs for its <Redirect>, so this screen briefly re-renders without data.
  if (!profile?.profile) return null;

  const personal = profile.profile;
  const goal = profile.currentGoal;
  const measurement = profile.latestMeasurement;

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen title="โปรไฟล์" subtitle="ข้อมูลสุขภาพและการตั้งค่าบัญชี">
      <Card>
        <View className="flex-row items-center gap-4">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600">
            <Text className="text-2xl font-bold text-white">
              {(personal.displayName ?? user?.email ?? 'U')
                .slice(0, 1)
                .toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-bold text-slate-950">
              {personal.displayName ?? 'ไม่ระบุชื่อ'}
            </Text>
            <Text className="mt-1 text-slate-500">{user?.email}</Text>
            <Text className="mt-2 text-xs font-semibold text-emerald-700">
              ข้อมูลที่บันทึกจริง
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="ข้อมูลสุขภาพที่บันทึกแล้ว" />
      <Card>
        <Row
          label="ส่วนสูง"
          value={personal.heightCm ? `${personal.heightCm} ซม.` : 'ไม่ระบุ'}
        />
        <Row
          label="น้ำหนักล่าสุด"
          value={measurement ? `${measurement.weightKg} กก.` : 'ไม่ระบุ'}
        />
        <Row
          label="เป้าหมาย"
          value={goal ? labels.goal[goal.goalType] : 'ไม่ระบุ'}
        />
        <Row
          label="ระดับกิจกรรม"
          value={
            personal.activityLevel
              ? labels.activity[personal.activityLevel]
              : 'ไม่ระบุ'
          }
        />
      </Card>

      <SectionHeader title="การตั้งค่า" />
      <Card>
        <Pressable
          accessibilityRole="button"
          className="min-h-16 justify-center"
          onPress={() => router.push('/nutrition-analysis')}
        >
          <Text className="font-bold text-emerald-700">AI วิเคราะห์โภชนาการ</Text>
          <Text className="mt-1 text-sm text-slate-500">คำนวณแคลอรี โปรตีน คาร์บ และไขมันที่เหมาะกับคุณ</Text>
        </Pressable>
      </Card>
      <Card>
        {settings.map((item) => (
          <Pressable
            key={item.section}
            accessibilityRole="button"
            className="min-h-16 flex-row items-center justify-between border-b border-slate-100 py-3 last:border-b-0"
            onPress={() =>
              router.push({
                pathname: '/settings/[section]',
                params: { section: item.section },
              })
            }
          >
            <View className="flex-1 pr-3">
              <Text className="font-semibold text-slate-900">{item.title}</Text>
              <Text className="mt-1 text-sm text-slate-500">{item.detail}</Text>
            </View>
            <Text className="text-slate-400">›</Text>
          </Pressable>
        ))}
      </Card>

      {loggingOut ? (
        <ActivityIndicator color="#dc2626" />
      ) : (
        <ActionButton label="ออกจากระบบ" variant="danger" onPress={logout} />
      )}
    </Screen>
  );
}
