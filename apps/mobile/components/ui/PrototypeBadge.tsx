import { Text, View } from 'react-native';

export function PrototypeBadge({ label = 'ข้อมูลจำลอง' }: { label?: string }) {
  return (
    <View className="self-start rounded-full bg-amber-100 px-3 py-1">
      <Text className="text-xs font-semibold text-amber-800">{label}</Text>
    </View>
  );
}
