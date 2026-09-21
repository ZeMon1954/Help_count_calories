import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, EmptyState } from '@/components/ui/Kit';
import { useAuth } from '@/providers/AuthProvider';
import {
  fetchActivities,
  fetchCurrentActivity,
  finishActivity,
  setActivityStatus,
  startActivity,
  type ActivityRecord,
  type ActivityType,
} from '@/services/api/activity';
import { ApiError } from '@/services/api/client';
import {
  beginBackgroundTracking,
  captureForegroundLocation,
  clearActivityPointQueue,
  clearBackgroundTracking,
  flushQueuedActivityPoints,
  pauseBackgroundTracking,
  requestActivityLocationPermissions,
} from '@/services/activity-tracking';

const labels: Record<ActivityType, string> = {
  walk: 'เดิน',
  run: 'วิ่ง',
  cycle: 'ปั่นจักรยาน',
};

const ActivityIcon = ({
  type,
  size = 24,
  color = '#ffffff',
}: {
  type: ActivityType;
  size?: number;
  color?: string;
}) => {
  const iconName = type === 'walk' ? 'walk' : type === 'run' ? 'run' : 'bike';
  return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
};

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const formatPace = (seconds: number | null) =>
  seconds
    ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    : '--:--';
const radians = (value: number) => (value * Math.PI) / 180;
function routeDistance(points: LatLng[]) {
  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]!;
    const lat = radians(point.latitude - previous.latitude);
    const lon = radians(point.longitude - previous.longitude);
    const value =
      Math.sin(lat / 2) ** 2 +
      Math.cos(radians(previous.latitude)) *
        Math.cos(radians(point.latitude)) *
        Math.sin(lon / 2) ** 2;
    return sum + 12_742_000 * Math.asin(Math.sqrt(value));
  }, 0);
}

function PressScale({
  children,
  onPress,
  disabled,
  className = '',
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={className}
      style={({ pressed }) => ({
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

export default function ActivityScreen() {
  const { session } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [type, setType] = useState<ActivityType>('run');
  const [active, setActive] = useState<ActivityRecord | null>(null);
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [route, setRoute] = useState<LatLng[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [panelVisible, setPanelVisible] = useState(true);
  const panelAnim = useRef(new Animated.Value(0)).current;

  const togglePanel = useCallback(() => {
    Animated.spring(panelAnim, {
      toValue: panelVisible ? 1 : 0,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
    setPanelVisible(!panelVisible);
  }, [panelVisible, panelAnim]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');

    // Request location in the background without blocking
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === 'granted') {
          Location.getLastKnownPositionAsync().then((loc) => {
            if (loc) setLocation((prev) => prev || loc);
          });
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
            .then((loc) => {
              setLocation(loc);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    try {
      const [current, items] = await Promise.all([
        fetchCurrentActivity(session.access_token),
        fetchActivities(session.access_token),
      ]);
      setActive(current);
      setHistory(items);
      if (current) {
        setType(current.activityType);
        if (current.status === 'in_progress') {
          const permission = await Location.getBackgroundPermissionsAsync();
          if (permission.granted) await beginBackgroundTracking(current.id);
          else setForegroundOnly(true);
        }
      }
    } catch {
      setError('โหลดข้อมูลกิจกรรมไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const update = () =>
      setElapsed(
        Math.max(
          0,
          Math.floor((Date.now() - Date.parse(active.startedAt)) / 1000),
        ),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active || active.status !== 'in_progress') return;
    let subscription: Location.LocationSubscription | undefined;
    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5_000,
        distanceInterval: 5,
      },
      (next) => {
        setLocation(next);
        const coordinate = {
          latitude: next.coords.latitude,
          longitude: next.coords.longitude,
        };
        setRoute((current) => [...current.slice(-1_999), coordinate]);
        mapRef.current?.animateCamera(
          { center: coordinate },
          { duration: 220 },
        );
        if (foregroundOnly && session?.access_token)
          void captureForegroundLocation(session.access_token, active.id, next);
      },
    ).then((value) => {
      subscription = value;
    });
    return () => subscription?.remove();
  }, [active, foregroundOnly, session?.access_token]);

  async function begin() {
    if (!session?.access_token || busy) return;
    setBusy(true);
    setError('');
    setRoute([]);
    try {
      const permission = await requestActivityLocationPermissions();
      if (!permission.foreground) {
        setError(
          permission.reason === 'location_services_disabled'
            ? 'กรุณาเปิด Location Services ของเครื่อง'
            : 'กรุณาอนุญาตตำแหน่งขณะใช้แอป',
        );
        return;
      }
      const next = await startActivity(session.access_token, type);
      if (permission.background) {
        await beginBackgroundTracking(next.id);
        setForegroundOnly(false);
      } else setForegroundOnly(true);
      setActive(next);
    } catch {
      setError('เปิด GPS ไม่สำเร็จ กรุณาตรวจสิทธิ์ตำแหน่ง');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    if (!active || !session?.access_token || busy) return;
    setBusy(true);
    setError('');
    try {
      const status = active.status === 'paused' ? 'in_progress' : 'paused';
      const next = await setActivityStatus(
        session.access_token,
        active.id,
        status,
      );
      if (status === 'paused') await pauseBackgroundTracking();
      else if (!foregroundOnly) await beginBackgroundTracking(active.id);
      setActive(next);
    } catch {
      setError('เปลี่ยนสถานะกิจกรรมไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!active || !session?.access_token || busy) return;
    setBusy(true);
    setError('');
    try {
      await pauseBackgroundTracking();
      await flushQueuedActivityPoints(session.access_token, active.id);
      const completed = await finishActivity(session.access_token, active.id);
      await clearBackgroundTracking();
      await clearActivityPointQueue(active.id);
      setForegroundOnly(false);
      setActive(null);
      setLocation(null);
      setRoute([]);
      setHistory((items) => [completed, ...items]);
    } catch (nextError) {
      setError(
        nextError instanceof ApiError
          ? `บันทึกไม่สำเร็จ (${nextError.status ?? 'network'}): ${nextError.message}`
          : 'บันทึกกิจกรรมไม่สำเร็จ ข้อมูลเดิมยังอยู่',
      );
    } finally {
      setBusy(false);
    }
  }

  const distanceM = useMemo(() => routeDistance(route), [route]);
  const pace =
    distanceM > 20 ? Math.round(elapsed / (distanceM / 1_000)) : null;
  const speedKmh =
    location?.coords.speed && location.coords.speed > 0
      ? location.coords.speed * 3.6
      : 0;

  const paused = active?.status === 'paused';

  return (
    <View className="flex-1 bg-slate-950">
      <View className="absolute inset-0">
        {location && Platform.OS !== 'web' ? (
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            showsUserLocation
            followsUserLocation={active?.status === 'in_progress'}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {route.length > 1 ? (
              <Polyline
                coordinates={route}
                strokeColor="#10b981"
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
              />
            ) : null}
            {route[0] ? (
              <Marker coordinate={route[0]} pinColor="#0f172a" />
            ) : null}
          </MapView>
        ) : (
          <View className="flex-1 items-center justify-center bg-slate-900">
            <View className="border-primary-500/30 bg-primary-500/10 shadow-primary-500/20 h-20 w-20 items-center justify-center rounded-full border shadow-lg">
              <ActivityIndicator color="#10b981" size="large" />
            </View>
            <Text className="mt-5 font-semibold text-white">
              กำลังจับสัญญาณ GPS
            </Text>
            <Text className="mt-1 text-sm text-slate-400">
              ออกไปในพื้นที่เปิดเพื่อความแม่นยำที่ดีขึ้น
            </Text>
          </View>
        )}
      </View>

      <SafeAreaView
        className="flex-1 justify-between"
        edges={['top', 'bottom']}
        pointerEvents="box-none"
      >
        {active ? (
          <>
            <View
              className="mx-4 mt-2 flex-row items-center justify-between"
              pointerEvents="box-none"
            >
              <View className="flex-row items-center gap-2 rounded-full bg-slate-950/85 px-4 py-2">
                <ActivityIcon
                  type={active.activityType}
                  size={16}
                  color="#ffffff"
                />
                <Text className="font-bold text-white">
                  {labels[active.activityType]}
                </Text>
              </View>
              <View
                className={`rounded-full px-3 py-2 ${paused ? 'bg-amber-400' : 'bg-emerald-500'}`}
              >
                <Text className="text-xs font-bold text-slate-950">
                  {paused ? 'พักอยู่' : '● LIVE'}
                </Text>
              </View>
            </View>

            <View className="mx-3 mb-2 overflow-hidden rounded-[36px] border border-white/10 bg-slate-950/95 p-6 shadow-2xl">
              {foregroundOnly ? (
                <Text className="mb-3 text-center text-xs font-medium text-amber-300">
                  {Platform.OS === 'web'
                    ? 'กรุณาเปิดหน้าจอและใช้งานแอปไว้ด้านหน้า การติดตามตำแหน่งอาจหยุดเมื่อสลับแอปหรือล็อกหน้าจอ'
                    : 'เปิดแอปค้างไว้เพื่อบันทึกเส้นทาง'}
                </Text>
              ) : null}
              <Text className="text-center text-[56px] font-black tracking-tighter text-white">
                {formatDuration(elapsed)}
              </Text>
              <Text className="-mt-1 text-center text-xs font-semibold uppercase tracking-[3px] text-slate-500">
                ระยะเวลาทั้งหมด
              </Text>
              <View className="my-5 h-px bg-white/10" />
              <View className="flex-row">
                {[
                  ['ระยะทาง', (distanceM / 1_000).toFixed(2), 'กม.'],
                  ['เพซ', formatPace(pace), '/กม.'],
                  ['ความเร็ว', speedKmh.toFixed(1), 'กม./ชม.'],
                ].map(([label, value, unit], index) => (
                  <View
                    key={String(label)}
                    className={`flex-1 items-center ${index ? 'border-l border-white/10' : ''}`}
                  >
                    <Text className="text-2xl font-bold text-white">
                      {value}
                    </Text>
                    <Text className="mt-1 text-[11px] text-slate-400">
                      {label} · {unit}
                    </Text>
                  </View>
                ))}
              </View>
              {error ? (
                <Text className="mt-4 rounded-xl bg-red-500/15 p-3 text-center text-sm text-red-300">
                  {error}
                </Text>
              ) : null}
              <View className="mt-6 flex-row items-center justify-center gap-5">
                <PressScale
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      'จบกิจกรรม?',
                      'ระบบจะคำนวณและบันทึกผลการออกกำลังกายครั้งนี้',
                      [
                        { text: 'ยกเลิก', style: 'cancel' },
                        {
                          text: 'จบและบันทึก',
                          style: 'destructive',
                          onPress: () => void finish(),
                        },
                      ],
                    )
                  }
                  className="h-16 w-16 items-center justify-center rounded-full bg-white/10"
                >
                  <Text className="text-xs font-bold text-white">จบ</Text>
                </PressScale>
                <PressScale
                  disabled={busy}
                  onPress={() => void togglePause()}
                  className={`h-20 w-20 items-center justify-center rounded-full ${paused ? 'bg-emerald-400' : 'bg-white'}`}
                >
                  <Text className="text-2xl text-slate-950">
                    {busy ? '…' : paused ? '▶' : 'Ⅱ'}
                  </Text>
                  <Text className="mt-1 text-[10px] font-bold text-slate-700">
                    {paused ? 'ทำต่อ' : 'พัก'}
                  </Text>
                </PressScale>
                <PressScale
                  onPress={() =>
                    location &&
                    mapRef.current?.animateCamera(
                      {
                        center: {
                          latitude: location.coords.latitude,
                          longitude: location.coords.longitude,
                        },
                        zoom: 17,
                      },
                      { duration: 220 },
                    )
                  }
                  className="h-16 w-16 items-center justify-center rounded-full bg-white/10"
                >
                  <Text className="text-xl text-white">⌖</Text>
                  <Text className="text-[10px] text-slate-300">ตำแหน่ง</Text>
                </PressScale>
              </View>
            </View>
          </>
        ) : (
          <>
            <View className="mx-4 mt-2" pointerEvents="box-none" />

            <Animated.View
              style={{
                position: 'absolute',
                bottom: 24,
                alignSelf: 'center',
                opacity: panelAnim,
                transform: [
                  {
                    scale: panelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 1],
                    }),
                  },
                ],
              }}
              pointerEvents={panelVisible ? 'none' : 'auto'}
            >
              <PressScale
                onPress={togglePanel}
                className="bg-primary-500 shadow-primary-500/30 h-16 flex-row items-center justify-center gap-2 rounded-full px-8 shadow-xl"
              >
                <MaterialCommunityIcons name="play" size={28} color="#020617" />
                <Text className="text-lg font-bold text-slate-950">
                  เริ่มกิจกรรม
                </Text>
              </PressScale>
            </Animated.View>

            <Animated.View
              style={{
                transform: [
                  {
                    translateY: panelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 500],
                    }),
                  },
                ],
              }}
              className="mx-3 mb-2 overflow-hidden rounded-[36px] border border-white/10 bg-slate-950/95 p-6 shadow-2xl"
              pointerEvents={panelVisible ? 'auto' : 'none'}
            >
              <View className="absolute right-4 top-4 z-10">
                <Pressable onPress={togglePanel} className="p-2">
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={28}
                    color="#64748b"
                  />
                </Pressable>
              </View>

              <Text className="text-primary-400 text-center text-xs font-bold uppercase tracking-[2px]">
                เลือกกิจกรรม
              </Text>
              <View className="mt-4 flex-row gap-2">
                {(['walk', 'run', 'cycle'] as const).map((value) => (
                  <PressScale
                    key={value}
                    onPress={() => setType(value)}
                    className={`min-h-[100px] flex-1 items-center justify-center rounded-[24px] border ${type === value ? 'bg-primary-500/20 border-primary-500' : 'border-white/5 bg-slate-900'}`}
                  >
                    <ActivityIcon
                      type={value}
                      size={36}
                      color={type === value ? '#10b981' : '#64748b'}
                    />
                    <Text
                      className={`mt-3 text-xs font-extrabold tracking-wide ${type === value ? 'text-primary-500' : 'text-slate-400'}`}
                    >
                      {labels[value]}
                    </Text>
                  </PressScale>
                ))}
              </View>
              <PressScale
                disabled={busy}
                onPress={() => void begin()}
                className="bg-primary-500 shadow-primary-500/30 mt-6 min-h-[64px] items-center justify-center rounded-full shadow-xl"
              >
                <Text className="text-xl font-black tracking-widest text-slate-950">
                  {busy ? 'กำลังเปิด GPS…' : `เริ่ม${labels[type]}`}
                </Text>
              </PressScale>

              <Pressable
                onPress={() => setShowHistory(true)}
                className="mt-5 items-center py-2"
              >
                <Text className="text-sm font-semibold text-slate-400">
                  ดูประวัติกิจกรรมล่าสุด
                </Text>
              </Pressable>
            </Animated.View>
          </>
        )}
      </SafeAreaView>

      <Modal
        visible={showHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowHistory(false)}
      >
        <SafeAreaView className="flex-1 bg-slate-50">
          <View className="flex-row items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
            <Text className="text-xl font-extrabold text-slate-900">
              ประวัติกิจกรรม
            </Text>
            <Pressable onPress={() => setShowHistory(false)}>
              <Text className="text-primary-600 text-base font-bold">ปิด</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="p-5 pb-20 gap-4">
            {history.length ? (
              history.map((item) => (
                <Card key={item.id}>
                  {Platform.OS !== 'web' &&
                  item.route &&
                  item.route.length > 1 ? (
                    <View className="mb-4 h-32 w-full overflow-hidden rounded-2xl bg-slate-100">
                      <MapView
                        style={{ flex: 1 }}
                        initialRegion={{
                          latitude: item.route[0]!.latitude,
                          longitude: item.route[0]!.longitude,
                          latitudeDelta: 0.015,
                          longitudeDelta: 0.015,
                        }}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        pitchEnabled={false}
                        rotateEnabled={false}
                        toolbarEnabled={false}
                      >
                        <Polyline
                          coordinates={item.route}
                          strokeColor="#10b981"
                          strokeWidth={4}
                          lineCap="round"
                          lineJoin="round"
                        />
                      </MapView>
                    </View>
                  ) : null}
                  <View className="flex-row items-center">
                    <View className="bg-primary-500/10 h-12 w-12 items-center justify-center rounded-2xl">
                      <ActivityIcon
                        type={item.activityType}
                        size={24}
                        color="#10b981"
                      />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="font-bold text-slate-950">
                        {labels[item.activityType]}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500">
                        {new Date(item.startedAt).toLocaleString('th-TH')}
                      </Text>
                    </View>
                    <Text className="text-lg font-bold text-slate-950">
                      {(item.distanceM / 1_000).toFixed(2)}{' '}
                      <Text className="text-xs font-medium text-slate-400">
                        กม.
                      </Text>
                    </Text>
                  </View>
                  <View className="mt-4 flex-row rounded-xl bg-slate-50 p-3">
                    <Text className="flex-1 text-xs text-slate-500">
                      เวลา{' '}
                      <Text className="font-bold text-slate-800">
                        {formatDuration(item.movingSeconds)}
                      </Text>
                    </Text>
                    <Text className="flex-1 text-xs text-slate-500">
                      เพซ{' '}
                      <Text className="font-bold text-slate-800">
                        {formatPace(item.averagePaceSecondsPerKm)}
                      </Text>
                    </Text>
                    <Text className="text-xs text-slate-500">
                      พลังงาน{' '}
                      <Text className="font-bold text-slate-800">
                        {Math.round(item.calories)} kcal
                      </Text>
                    </Text>
                  </View>
                </Card>
              ))
            ) : (
              <EmptyState
                title="ยังไม่มีกิจกรรม"
                description="ออกไปขยับเพื่อบันทึกกิจกรรมแรกของคุณ!"
              />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
