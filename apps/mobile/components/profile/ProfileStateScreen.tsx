import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import appIcon from '../../public/icon-192.png';

interface ProfileStateScreenProps {
  error?: string;
  onRetry?: () => void;
}

export function ProfileStateScreen({
  error,
  onRetry,
}: ProfileStateScreenProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!active || reduceMotion || error) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 850,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 850,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
    });

    return () => {
      active = false;
      animation?.stop();
    };
  }, [error, pulse]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="flex-1 items-center justify-center px-6">
        {error ? (
          <>
            <View className="mb-6 rounded-[28px] bg-white p-3 shadow-sm shadow-slate-300/50">
              <Image source={appIcon} className="h-20 w-20 rounded-[20px]" />
            </View>
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
            <Animated.View
              accessibilityLabel="กำลังเปิดแอปและเชื่อมต่อเซิร์ฟเวอร์"
              accessibilityRole="progressbar"
              className="rounded-[32px] bg-white p-3 shadow-lg shadow-emerald-900/10"
              style={{
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.62, 1],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1.04],
                    }),
                  },
                ],
              }}
            >
              <Image source={appIcon} className="h-24 w-24 rounded-[24px]" />
            </Animated.View>
            <Text className="mt-7 text-center text-lg font-bold text-slate-900">
              กำลังเตรียมแอปให้พร้อม
            </Text>
            <Text className="mt-2 text-center text-sm leading-6 text-slate-600">
              กำลังเปิดเซิร์ฟเวอร์ กรุณารอสักครู่...
            </Text>
            <Text className="mt-1 max-w-sm text-center text-xs leading-5 text-slate-400">
              เซิร์ฟเวอร์แผนฟรีอาจใช้เวลาสักครู่เมื่อเริ่มทำงานใหม่
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
