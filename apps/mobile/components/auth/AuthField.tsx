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
        className={`flex-row items-center rounded-xl border bg-white px-4 ${error ? 'border-red-500' : 'border-slate-300'}`}
      >
        <TextInput
          {...props}
          className="min-h-12 flex-1 py-3 text-base text-slate-950"
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
            <Text className="font-medium text-emerald-700">
              {visible ? 'ซ่อน' : 'แสดง'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
