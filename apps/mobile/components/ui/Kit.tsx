import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function Card({ children }: PropsWithChildren) {
  return (
    <View className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/50">
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
    <View className="flex-row items-center justify-between">
      <Text className="text-xl font-extrabold tracking-tight text-slate-900">{title}</Text>
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
    <View className="h-3 overflow-hidden rounded-full bg-slate-100">
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
      className={`min-h-[56px] items-center justify-center rounded-2xl px-6 ${colors} active:scale-[0.98] ${disabled ? 'opacity-50' : ''} shadow-sm`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`text-base font-bold tracking-wide ${textColor}`}>{label}</Text>
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
    <View className="items-center gap-4 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8">
      <Text className="text-xl font-bold text-slate-800">{title}</Text>
      <Text className="text-center text-base leading-6 text-slate-500">
        {description}
      </Text>
      {action}
    </View>
  );
}
