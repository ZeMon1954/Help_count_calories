import type { PropsWithChildren, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AuthScaffoldProps extends PropsWithChildren {
  title: string;
  subtitle: string;
  footer?: ReactNode;
}

export function AuthScaffold({
  title,
  subtitle,
  footer,
  children,
}: AuthScaffoldProps) {
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
        duration: 500,
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

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow justify-center px-6 py-10"
        >
          <Animated.View 
            style={{ opacity: fadeAnim, transform: [{ translateY }] }}
            className="mx-auto w-full max-w-xl"
          >
            <View className="mb-10 gap-3">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-primary-600 shadow-lg shadow-primary-600/30">
                <Text className="text-2xl font-black text-white">AI</Text>
              </View>
              <Text className="text-4xl font-extrabold tracking-tight text-slate-900">
                {title}
              </Text>
              <Text className="text-lg font-medium leading-7 text-slate-500">
                {subtitle}
              </Text>
            </View>
            <View className="gap-4">{children}</View>
            {footer ? (
              <View className="mt-8 items-center">{footer}</View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
