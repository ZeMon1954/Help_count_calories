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

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
      confirmation: !confirmation
        ? 'กรุณายืนยันรหัสผ่าน'
        : confirmation !== password
          ? 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'
          : undefined,
    };
    setErrors(
      Object.fromEntries(
        Object.entries(nextErrors).filter((entry) => entry[1]),
      ) as Record<string, string>,
    );
    if (Object.values(nextErrors).some(Boolean)) return;

    setLoading(true);
    setSubmitError('');
    try {
      const result = await signUp(email, password);
      // Only navigate while no session exists. When sign-up returns a session,
      // (auth)/_layout renders its <Redirect> and unmounts this Stack, so
      // navigating here would run without a navigation context.
      if (result.requiresEmailVerification) {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email: email.trim() },
        });
      }
    } catch (error) {
      setSubmitError(getThaiAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      title="สร้างบัญชี"
      subtitle="เริ่มต้นดูแลสุขภาพในแบบของคุณ"
      footer={
        <Text className="text-slate-600">
          มีบัญชีแล้ว?{' '}
          <Link className="font-bold text-primary-600 active:text-primary-800" href="/(auth)/login">
            เข้าสู่ระบบ
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
        autoComplete="new-password"
        password
        placeholder="อย่างน้อย 6 ตัวอักษร"
      />
      <AuthField
        label="ยืนยันรหัสผ่าน"
        value={confirmation}
        onChangeText={setConfirmation}
        error={errors.confirmation}
        autoCapitalize="none"
        autoComplete="new-password"
        password
        placeholder="กรอกรหัสผ่านอีกครั้ง"
      />
      {submitError ? (
        <Text className="rounded-xl bg-red-50 p-3 text-red-700">
          {submitError}
        </Text>
      ) : null}
      <PrimaryButton label="สมัครสมาชิก" loading={loading} onPress={submit} />
    </AuthScaffold>
  );
}
