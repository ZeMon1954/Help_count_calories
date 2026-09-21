import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

interface AuthFieldProps extends TextInputProps {
  label: string;
  error?: string;
  password?: boolean;
}

export function AuthField({
  label,
  error,
  password = false,
  ...props
}: AuthFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="gap-2">
      <Text className="font-medium text-slate-800">{label}</Text>
      <View
        className={`flex-row items-center rounded-2xl border-2 bg-white px-5 shadow-sm shadow-slate-100 ${error ? 'border-red-500' : 'border-slate-200 focus:border-primary-500'}`}
      >
        <TextInput
          {...props}
          className="min-h-[56px] flex-1 py-3 text-base font-medium text-slate-900"
          placeholderTextColor="#94a3b8"
          secureTextEntry={password && !visible}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            hitSlop={10}
            onPress={() => setVisible((value) => !value)}
          >
            <Text className="font-bold text-primary-600 active:text-primary-800">
              {visible ? 'ซ่อน' : 'แสดง'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
