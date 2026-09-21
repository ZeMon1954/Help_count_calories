import { ActivityIndicator, Pressable, Text } from 'react-native';

interface PrimaryButtonProps {
  label: string;
  loading?: boolean;
  onPress: () => void;
}

export function PrimaryButton({
  label,
  loading = false,
  onPress,
}: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-[56px] items-center justify-center rounded-2xl bg-primary-600 px-6 py-4 shadow-lg shadow-primary-600/30 active:bg-primary-700 active:scale-[0.98] transition-all ${loading ? 'opacity-60' : ''}`}
      disabled={loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="text-lg font-bold tracking-wide text-white">{label}</Text>
      )}
    </Pressable>
  );
}
