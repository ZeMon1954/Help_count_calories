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
    <View
      className={`mx-auto w-full max-w-2xl gap-5 ${scroll ? '' : 'flex-1 px-4 pb-0 pt-4 sm:px-6 sm:pt-6'}`}
    >
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="text-[28px] font-extrabold leading-9 tracking-tight text-slate-950">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-[15px] font-medium leading-6 text-slate-500">{subtitle}</Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow px-4 pb-32 pt-4 sm:px-6 sm:pt-6"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
