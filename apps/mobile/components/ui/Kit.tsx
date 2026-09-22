import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function Card({ children }: PropsWithChildren) {
  return (
    <View className="rounded-[24px] border border-slate-200/70 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5">
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <View className="min-h-8 flex-row flex-wrap items-center justify-between gap-2">
      <Text className="min-w-0 flex-1 text-lg font-extrabold leading-7 tracking-tight text-slate-950">{title}</Text>
      {action}
    </View>
  );
}

export function ProgressBar({
  value,
  color = 'bg-primary-500',
}: {
  value: number;
  color?: string;
}) {
  return (
    <View className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <View
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const colors =
    variant === 'primary'
      ? 'bg-primary-600 active:bg-primary-700'
      : variant === 'danger'
        ? 'bg-red-500 active:bg-red-600'
        : 'border-2 border-slate-200 bg-white active:bg-slate-50';
  const textColor = variant === 'secondary' ? 'text-slate-800' : 'text-white';
  // `active:scale-*` must stay in every state. Adding a transform class only on
  // some renders makes NativeWind upgrade the component to an animated one
  // after its initial render, which triggers its dev-only upgrade warning — and
  // that warning's serializer crashes while stringifying the props.
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-[52px] items-center justify-center rounded-2xl px-5 ${colors} active:scale-[0.97] ${disabled ? 'opacity-50' : ''} shadow-sm`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`text-center text-base font-bold ${textColor}`}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center gap-3 rounded-[24px] border border-dashed border-slate-300 bg-white p-6">
      <Text className="text-center text-lg font-bold text-slate-900">{title}</Text>
      <Text className="text-center text-[15px] leading-6 text-slate-500">
        {description}
      </Text>
      {action}
    </View>
  );
}
