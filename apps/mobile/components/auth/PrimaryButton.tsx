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
      className={`min-h-[52px] items-center justify-center rounded-2xl bg-primary-600 px-5 py-3 shadow-sm active:scale-[0.97] active:bg-primary-700 ${loading ? 'opacity-60' : ''}`}
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
