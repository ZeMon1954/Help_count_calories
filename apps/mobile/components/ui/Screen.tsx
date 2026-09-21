import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  scroll?: boolean;
}

export function Screen({
  title,
  subtitle,
  action,
  scroll = true,
  children,
}: ScreenProps) {
  const fadeAnim = useRef(
    new Animated.Value(Platform.OS === 'web' ? 1 : 0),
  ).current;
  const translateY = useRef(
    new Animated.Value(Platform.OS === 'web' ? 0 : 20),
  ).current;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  const content = (
    <Animated.View 
      style={{ opacity: fadeAnim, transform: [{ translateY }] }}
      className={`mx-auto w-full max-w-xl gap-6 px-6 pt-6 ${scroll ? 'pb-28' : 'pb-0 flex-1'}`}
    >
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-2">
          <Text className="text-3xl font-extrabold tracking-tight text-slate-900">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-base font-medium leading-6 text-slate-500">{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top']}>
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
