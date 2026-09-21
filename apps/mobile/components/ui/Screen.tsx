import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
  const content = (
    <View className="mx-auto w-full max-w-xl gap-5 px-5 pb-28 pt-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="flex-1 gap-1">
          <Text className="text-3xl font-bold tracking-tight text-slate-950">
            {title}
          </Text>
          {subtitle ? (
            <Text className="leading-5 text-slate-500">{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
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
