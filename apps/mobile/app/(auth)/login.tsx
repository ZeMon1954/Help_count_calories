import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { AuthField } from '@/components/auth/AuthField';
import { AuthScaffold } from '@/components/auth/AuthScaffold';
import { PrimaryButton } from '@/components/auth/PrimaryButton';
import { useAuth } from '@/providers/AuthProvider';
import {
  getThaiAuthError,
  validateEmail,
  validatePassword,
} from '@/utils/auth-validation';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(
      Object.fromEntries(
        Object.entries(nextErrors).filter((entry) => entry[1]),
      ) as Record<string, string>,
    );
    if (nextErrors.email || nextErrors.password) return;

    setLoading(true);
    setSubmitError('');
    try {
      await signIn(email, password);
      router.replace('/home');
    } catch (error) {
      setSubmitError(getThaiAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="ยินดีต้อนรับกลับ"
      subtitle="เข้าสู่ระบบเพื่อดูข้อมูลสุขภาพของคุณ"
      footer={
        <Text className="text-slate-600">
          ยังไม่มีบัญชี?{' '}
          <Link
            className="font-semibold text-emerald-700"
            href="/(auth)/register"
          >
            สมัครสมาชิก
          </Link>
        </Text>
      }
    >
      <AuthField
        label="อีเมล"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <AuthField
        label="รหัสผ่าน"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoCapitalize="none"
        autoComplete="current-password"
        password
        placeholder="รหัสผ่าน"
      />
      <Link
        className="self-end font-medium text-emerald-700"
        href="/(auth)/forgot-password"
      >
        ลืมรหัสผ่าน?
      </Link>
      {submitError ? (
        <Text className="rounded-xl bg-red-50 p-3 text-red-700">
          {submitError}
        </Text>
      ) : null}
      <PrimaryButton label="เข้าสู่ระบบ" loading={loading} onPress={submit} />
    </AuthScaffold>
  );
}
