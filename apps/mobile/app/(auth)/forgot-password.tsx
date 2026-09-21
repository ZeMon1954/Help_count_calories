import { Link } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthField } from '@/components/auth/AuthField';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { PrimaryButton } from '@/components/auth/PrimaryButton';
import { useAuth } from '@/providers/AuthProvider';
import { getThaiAuthError, validateEmail } from '@/utils/auth-validation';

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    const validationError = validateEmail(email);
    if (validationError) return setError(validationError);
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await requestPasswordReset(email);
      setMessage('หากอีเมลนี้มีบัญชีอยู่ ระบบได้ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว');
    } catch (submitError) {
      setError(getThaiAuthError(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="ลืมรหัสผ่าน"
      subtitle="กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่"
      footer={
        <Link className="font-bold text-primary-600 active:text-primary-800" href="/(auth)/login">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      }
    >
      <AuthField
        label="อีเมล"
        value={email}
        onChangeText={setEmail}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      {message ? (
        <Text className="rounded-2xl border border-primary-100 bg-primary-50 p-4 leading-6 text-primary-900 shadow-sm shadow-primary-100/50">
          {message}
        </Text>
      ) : null}
      <PrimaryButton
        label="ส่งลิงก์รีเซ็ตรหัสผ่าน"
        loading={loading}
        onPress={submit}
      />
    </AuthScaffold>
  );
}
