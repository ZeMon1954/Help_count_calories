import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export function Card({ children }: PropsWithChildren) {
  return (
    <View className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
      <Text className="text-lg font-bold text-slate-950">{title}</Text>
      {action}
    </View>
  );
}

export function ProgressBar({
  value,
  color = 'bg-emerald-500',
}: {
  value: number;
  color?: string;
}) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-slate-200">
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
      ? 'bg-emerald-600'
      : variant === 'danger'
        ? 'bg-red-600'
        : 'border border-slate-300 bg-white';
  const textColor = variant === 'secondary' ? 'text-slate-800' : 'text-white';
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 items-center justify-center rounded-xl px-4 ${colors} ${disabled ? 'opacity-50' : ''}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className={`font-semibold ${textColor}`}>{label}</Text>
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
    <View className="items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
      <Text className="text-lg font-semibold text-slate-900">{title}</Text>
      <Text className="text-center leading-5 text-slate-500">
        {description}
      </Text>
      {action}
    </View>
  );
}
