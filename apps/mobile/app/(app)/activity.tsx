import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ActionButton, Card, SectionHeader } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import {
  fetchActivities,
  type ActivityRecord,
  type ActivityType,
} from '@/services/api/activity';

const labels: Record<ActivityType, string> = {
  walk: 'เดิน',
  run: 'วิ่ง',
  cycle: 'ปั่นจักรยาน',
};

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatPace = (seconds: number | null) =>
  seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    : '--:--';

function ActivityIcon({ type }: { type: ActivityType }) {
  const name = type === 'walk' ? 'walk' : type === 'cycle' ? 'bike' : 'run';
  return <MaterialCommunityIcons name={name} size={24} color="#059669" />;
}

function HistoryRow({ item }: { item: ActivityRecord }) {
  return (
    <View className="border-t border-slate-100 py-4 first:border-t-0">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50">
          <ActivityIcon type={item.activityType} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-bold text-slate-950">
            {labels[item.activityType]}
          </Text>
          <Text className="mt-0.5 text-xs text-slate-500">
            {new Date(item.endedAt ?? item.startedAt).toLocaleDateString(
              'th-TH',
              {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              },
            )}
          </Text>
        </View>
        <Text className="text-xl font-black text-slate-950">
          {(item.distanceM / 1_000).toFixed(2)}
          <Text className="text-xs font-medium text-slate-400"> กม.</Text>
        </Text>
      </View>

      <View className="mt-3 flex-row divide-x divide-slate-200 rounded-2xl bg-slate-50 px-2 py-3">
        <View className="flex-1 items-center px-1">
          <Text className="text-xs text-slate-400">เวลา</Text>
          <Text className="mt-1 font-bold text-slate-800">
            {formatDuration(item.elapsedSeconds)}
          </Text>
        </View>
        <View className="flex-1 items-center px-1">
          <Text className="text-xs text-slate-400">เพซเฉลี่ย</Text>
          <Text className="mt-1 font-bold text-slate-800">
            {formatPace(item.averagePaceSecondsPerKm)} /กม.
          </Text>
        </View>
      </View>
    </View>
  );
}

function startOfWeek(value: string) {
  const date = new Date(value);
  const day = date.getDay();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function weekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const format = (date: Date) =>
    date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return `${format(start)} – ${format(end)}`;
}

export default function ActivityScreen() {
  const { session } = useAuth();
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedPastWeek, setExpandedPastWeek] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      setHistory(await fetchActivities(session.access_token, 100));
    } catch {
      setError('โหลดประวัติการวิ่งไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const weeklyHistory = useMemo(() => {
    const completed = history.filter((item) => item.status === 'completed');
    const groups = new Map<string, { start: Date; items: ActivityRecord[] }>();
    completed.forEach((item) => {
      const start = startOfWeek(item.endedAt ?? item.startedAt);
      const key = start.toISOString().slice(0, 10);
      const group = groups.get(key) ?? { start, items: [] };
      group.items.push(item);
      groups.set(key, group);
    });
    return [...groups.values()].sort(
      (a, b) => b.start.getTime() - a.start.getTime(),
    );
  }, [history]);
  const currentWeekStart = startOfWeek(new Date().toISOString());
  const currentWeekKey = currentWeekStart.toISOString().slice(0, 10);
  const currentWeek = weeklyHistory.find(
    (week) => week.start.toISOString().slice(0, 10) === currentWeekKey,
  ) ?? { start: currentWeekStart, items: [] };
  const pastWeeks = weeklyHistory.filter(
    (week) => week.start.toISOString().slice(0, 10) !== currentWeekKey,
  );

  return (
    <Screen
      title="กิจกรรม"
      subtitle="นำเข้ารูปสรุปจากแอปวิ่ง แล้วเก็บระยะทาง เพซ และเวลาไว้ในที่เดียว"
    >
      <Card>
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
          <MaterialCommunityIcons name="image-plus" size={28} color="#047857" />
        </View>
        <Text className="mt-4 text-xl font-extrabold text-slate-950">
          เพิ่มผลการวิ่งจากรูป
        </Text>
        <Text className="mt-2 leading-6 text-slate-600">
          อัปโหลดภาพหน้าสรุปจาก Strava, Garmin, Nike Run Club หรือแอปวิ่งอื่น
          ระบบจะอ่านระยะทางและเวลาให้ จากนั้นคุณตรวจแก้ก่อนบันทึกได้
        </Text>
        <View className="mt-5">
          <ActionButton
            label="เลือกรูปผลการวิ่ง"
            onPress={() => router.push('../import-run')}
          />
        </View>
        <Text className="mt-3 text-center text-xs leading-5 text-slate-400">
          ระบบจะคำนวณเพซและแคลอรีจากข้อมูลที่ยืนยันแล้ว ·
          ไม่เก็บไฟล์รูปหลังวิเคราะห์
        </Text>
      </Card>

      {error ? (
        <View className="rounded-2xl bg-red-50 p-4">
          <Text className="text-red-700">{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()}>
            <Text className="mt-2 font-bold text-red-700">ลองใหม่</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionHeader title="สรุปการวิ่งรายสัปดาห์" />
      {loading ? (
        <ActivityIndicator color="#059669" />
      ) : (
        <View className="gap-3">
          <Card>
            <Text className="text-xs font-bold text-emerald-700">
              สัปดาห์นี้
            </Text>
            <Text className="mt-1 text-lg font-extrabold text-slate-950">
              {weekLabel(currentWeek.start)}
            </Text>
            {currentWeek.items.length ? (
              (() => {
                const distanceM = currentWeek.items.reduce(
                  (sum, item) => sum + item.distanceM,
                  0,
                );
                const seconds = currentWeek.items.reduce(
                  (sum, item) => sum + item.elapsedSeconds,
                  0,
                );
                const pace = Math.round(seconds / (distanceM / 1_000));
                return (
                  <>
                    <Text className="mt-1 text-sm text-slate-500">
                      วิ่ง {currentWeek.items.length} วัน ·{' '}
                      {Math.round(distanceM / 100) / 10} กม. ·{' '}
                      {formatDuration(seconds)} ชม. · เพซเฉลี่ย{' '}
                      {formatPace(pace)} /กม.
                    </Text>
                    <View className="mt-2">
                      {currentWeek.items.map((item) => (
                        <HistoryRow key={item.id} item={item} />
                      ))}
                    </View>
                  </>
                );
              })()
            ) : (
              <Text className="mt-3 text-sm text-slate-500">
                ยังไม่มีการวิ่งในสัปดาห์นี้
              </Text>
            )}
          </Card>

          {pastWeeks.length ? (
            <Card>
              <Text className="text-lg font-extrabold text-slate-950">
                สัปดาห์ที่ผ่านมา
              </Text>
              <Text className="mt-1 text-sm text-slate-500">
                แตะเพื่อดูรายละเอียดรายวัน
              </Text>
              <View className="mt-2">
                {pastWeeks.map((week) => {
                  const key = week.start.toISOString();
                  const open = expandedPastWeek === key;
                  const distanceM = week.items.reduce(
                    (sum, item) => sum + item.distanceM,
                    0,
                  );
                  const seconds = week.items.reduce(
                    (sum, item) => sum + item.elapsedSeconds,
                    0,
                  );
                  const pace = Math.round(seconds / (distanceM / 1_000));
                  return (
                    <View
                      key={key}
                      className="border-t border-slate-100 py-4 first:border-t-0"
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: open }}
                        onPress={() => setExpandedPastWeek(open ? null : key)}
                      >
                        <View className="flex-row items-center justify-between gap-3">
                          <View className="min-w-0 flex-1">
                            <Text className="font-bold text-slate-900">
                              {weekLabel(week.start)}
                            </Text>
                            <Text className="mt-1 text-sm text-slate-500">
                              {week.items.length} วัน ·{' '}
                              {Math.round(distanceM / 100) / 10} กม. · เพซ{' '}
                              {formatPace(pace)}
                            </Text>
                          </View>
                          <Text className="font-bold text-emerald-700">
                            {open ? 'ซ่อน ︿' : 'ดู ﹀'}
                          </Text>
                        </View>
                      </Pressable>
                      {open ? (
                        <View className="mt-2">
                          {week.items.map((item) => (
                            <HistoryRow key={item.id} item={item} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
