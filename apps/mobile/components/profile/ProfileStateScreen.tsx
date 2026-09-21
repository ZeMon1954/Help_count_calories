import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ProfileStateScreenProps {
  error?: string;
  onRetry?: () => void;
}

export function ProfileStateScreen({
  error,
  onRetry,
}: ProfileStateScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center gap-4 px-6">
        {error ? (
          <>
            <Text className="text-center text-base leading-6 text-red-700">
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="rounded-xl bg-emerald-600 px-6 py-3"
              onPress={onRetry}
            >
              <Text className="font-semibold text-white">ลองอีกครั้ง</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#059669" size="large" />
            <Text className="text-center text-slate-600">
              กำลังเปิดเซิร์ฟเวอร์ กรุณารอสักครู่...
            </Text>
            <Text className="text-center text-xs text-slate-400">
              เซิร์ฟเวอร์แผนฟรีอาจใช้เวลาสักครู่เมื่อเริ่มทำงานใหม่
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
