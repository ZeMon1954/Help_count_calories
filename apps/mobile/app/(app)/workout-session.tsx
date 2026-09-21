import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ActionButton, Card, EmptyState, ProgressBar } from '@/components/ui/Kit';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { fetchActiveWorkout, fetchCurrentWorkoutSession, finishWorkoutSession,
  saveWorkoutSet, startWorkoutSession, type WorkoutDay } from '@/services/api/workout';

export default function WorkoutSessionScreen() {
  const { dayId } = useLocalSearchParams<{ dayId?: string }>();
  const { session } = useAuth();
  const [day, setDay] = useState<WorkoutDay | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function begin() {
      if (!session?.access_token || !dayId) { setError('ไม่พบวันที่ต้องการฝึก'); setLoading(false); return; }
      try {
        const [plan, current] = await Promise.all([
          fetchActiveWorkout(session.access_token), fetchCurrentWorkoutSession(session.access_token),
        ]);
        const effectiveDayId = current?.planDayId ?? dayId;
        const selected = plan?.days.find((item) => item.id === effectiveDayId) ?? null;
        if (!selected || selected.isRestDay) throw new Error('invalid day');
        const started = current ?? await startWorkoutSession(session.access_token, dayId);
        if (!active) return;
        setDay(selected); setSessionId(started.id);
        if (current) {
          setCompleted(Object.fromEntries(current.sets.map((item) => [`${item.exerciseId}:${item.setNumber}`, item.completed])));
          setReps(Object.fromEntries(current.sets.map((item) => [`${item.exerciseId}:${item.setNumber}`, item.reps?.toString() ?? ''])));
          setWeights(Object.fromEntries(current.sets.map((item) => [`${item.exerciseId}:${item.setNumber}`, item.weightKg?.toString() ?? ''])));
        }
      } catch { if (active) setError('เริ่มหรือกู้คืนการฝึกไม่สำเร็จ กรุณาลองใหม่'); }
      finally { if (active) setLoading(false); }
    }
    void begin(); return () => { active = false; };
  }, [dayId, session?.access_token]);

  const total = useMemo(() => day?.exercises.reduce((sum, item) => sum + (item.targetSets ?? 0), 0) ?? 0, [day]);
  const completedCount = Object.values(completed).filter(Boolean).length;

  async function toggle(exerciseId: string, setNumber: number) {
    if (!session?.access_token || !sessionId || savingKey) return;
    const key = `${exerciseId}:${setNumber}`; const next = !completed[key];
    const parsedReps = reps[key] ? Number(reps[key]) : null;
    const parsedWeight = weights[key] ? Number(weights[key]) : null;
    if ((parsedReps !== null && (!Number.isInteger(parsedReps) || parsedReps < 0)) ||
      (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight < 0))) {
      setError('จำนวนครั้งหรือน้ำหนักไม่ถูกต้อง'); return;
    }
    setSavingKey(key); setError('');
    try {
      await saveWorkoutSet(session.access_token, sessionId, exerciseId, setNumber, next, parsedReps, parsedWeight);
      setCompleted((current) => ({ ...current, [key]: next }));
    } catch { setError('บันทึกเซตไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSavingKey(''); }
  }

  async function finish() {
    if (!session?.access_token || !sessionId || finishing) return;
    setFinishing(true); setError('');
    try { await finishWorkoutSession(session.access_token, sessionId); router.replace('/workout'); }
    catch { setError('จบการฝึกไม่สำเร็จ กรุณาลองใหม่'); setFinishing(false); }
  }

  if (loading) return <Screen title="กำลังเปิดการฝึก"><Card><ActivityIndicator color="#059669" /></Card></Screen>;
  if (!day || (error && !sessionId)) return <Screen title="เปิดการฝึกไม่ได้"><EmptyState title="ไม่สามารถเปิดเซสชันได้" description={error} action={<ActionButton label="กลับ" onPress={() => router.back()} />} /></Screen>;

  return <Screen title={day.name ?? 'การฝึกวันนี้'} subtitle="กรอกจำนวนครั้งและน้ำหนัก แล้วแตะเลขเซตเพื่อบันทึก">
    <View className="gap-2"><View className="flex-row justify-between"><Text className="text-slate-600">ความคืบหน้า</Text><Text className="font-semibold text-slate-900">{completedCount}/{total} เซต</Text></View><ProgressBar value={total ? completedCount / total * 100 : 0} /></View>
    {day.exercises.map((exercise) => <Card key={exercise.id}>
      <Text className="font-bold text-slate-950">{exercise.name}</Text>
      <Text className="mt-1 text-sm text-slate-500">เป้าหมาย {exercise.targetReps ?? '-'} · พัก {exercise.restSeconds ?? 0} วินาที</Text>
      <View className="mt-4 gap-3">{Array.from({ length: exercise.targetSets ?? 0 }, (_, index) => {
        const number = index + 1; const key = `${exercise.exerciseId}:${number}`; const done = completed[key] === true;
        return <View key={number} className="flex-row items-center gap-2">
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} disabled={Boolean(savingKey)} onPress={() => void toggle(exercise.exerciseId, number)} className={`h-12 w-12 items-center justify-center rounded-full ${done ? 'bg-emerald-600' : 'border-2 border-slate-300 bg-white'}`}>
            <Text className={done ? 'font-bold text-white' : 'text-slate-500'}>{savingKey === key ? '…' : done ? '✓' : number}</Text>
          </Pressable>
          <TextInput accessibilityLabel={`จำนวนครั้ง เซต ${number}`} placeholder="ครั้ง" keyboardType="number-pad" className="min-h-12 flex-1 rounded-xl border border-slate-300 px-3 text-slate-900" value={reps[key] ?? ''} onChangeText={(value) => setReps((old) => ({ ...old, [key]: value.replace(/[^0-9]/g, '') }))} />
          <TextInput accessibilityLabel={`น้ำหนัก เซต ${number}`} placeholder="กก." keyboardType="decimal-pad" className="min-h-12 flex-1 rounded-xl border border-slate-300 px-3 text-slate-900" value={weights[key] ?? ''} onChangeText={(value) => setWeights((old) => ({ ...old, [key]: value.replace(/[^0-9.]/g, '') }))} />
        </View>;
      })}</View>
    </Card>)}
    {error ? <Text className="rounded-xl bg-red-50 p-3 text-red-700">{error}</Text> : null}
    <ActionButton label={finishing ? 'กำลังบันทึก...' : 'จบการฝึก'} disabled={finishing} onPress={() => void finish()} />
    <ActionButton label="กลับโดยเก็บเซสชันไว้" variant="secondary" onPress={() => router.back()} />
  </Screen>;
}
