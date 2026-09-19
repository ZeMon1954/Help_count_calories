import type { PropsWithChildren, ReactNode } from 'react';
import {
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
  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow justify-center px-6 py-10"
        >
          <View className="mx-auto w-full max-w-xl">
            <View className="mb-8 gap-2">
              <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500">
                <Text className="text-xl font-bold text-white">AI</Text>
              </View>
              <Text className="text-3xl font-bold tracking-tight text-slate-950">
                {title}
              </Text>
              <Text className="text-base leading-6 text-slate-500">
                {subtitle}
              </Text>
            </View>
            <View className="gap-4">{children}</View>
            {footer ? (
              <View className="mt-8 items-center">{footer}</View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
