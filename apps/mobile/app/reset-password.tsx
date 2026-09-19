import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthField } from '@/components/auth/AuthField';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { PrimaryButton } from '@/components/auth/PrimaryButton';
import { useAuth } from '@/providers/AuthProvider';
import { getThaiAuthError, validatePassword } from '@/utils/auth-validation';

export default function ResetPasswordScreen() {
  const { recoveryMode, session, updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    const validationError = validatePassword(password);
    if (validationError) return setError(validationError);
    if (password !== confirmation)
      return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    setLoading(true);
    setError('');
    try {
      await updatePassword(password);
      router.replace('/home');
    } catch (submitError) {
      setError(getThaiAuthError(submitError));
    } finally {
      setLoading(false);
    }
  }

  if (!session || !recoveryMode) {
    return (
      <AuthScaffold
        title="ลิงก์ไม่พร้อมใช้งาน"
        subtitle="กรุณาขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง"
      >
        <Text className="rounded-xl bg-amber-50 p-4 text-amber-900">
          ลิงก์อาจหมดอายุหรือไม่ถูกต้อง
        </Text>
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      title="ตั้งรหัสผ่านใหม่"
      subtitle="เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ"
    >
      <AuthField
        label="รหัสผ่านใหม่"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        password
        placeholder="อย่างน้อย 6 ตัวอักษร"
      />
      <AuthField
        label="ยืนยันรหัสผ่านใหม่"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="none"
        autoComplete="new-password"
        password
        placeholder="กรอกรหัสผ่านอีกครั้ง"
      />
      {error ? (
        <Text className="rounded-xl bg-red-50 p-3 text-red-700">{error}</Text>
      ) : null}
      <PrimaryButton
        label="บันทึกรหัสผ่านใหม่"
        loading={loading}
        onPress={submit}
      />
    </AuthScaffold>
  );
}
