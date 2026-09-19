import { Link, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';

import { AuthScaffold } from '@/components/auth/AuthScaffold';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return (
    <AuthScaffold
      title="ตรวจสอบอีเมลของคุณ"
      subtitle="เราได้ส่งลิงก์ยืนยันบัญชีแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ"
      footer={
        <Link className="font-semibold text-emerald-700" href="/(auth)/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      }
    >
      <Text className="rounded-xl bg-emerald-50 p-4 text-center leading-6 text-emerald-900">
        {email
          ? `ส่งลิงก์ไปที่ ${email}`
          : 'เปิดอีเมลของคุณและกดลิงก์ยืนยันบัญชี'}
      </Text>
    </AuthScaffold>
  );
}
