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
        <Link className="font-bold text-primary-600 active:text-primary-800" href="/(auth)/login">
          ไปหน้าเข้าสู่ระบบ
        </Link>
      }
    >
      <Text className="rounded-2xl border border-primary-100 bg-primary-50 p-5 text-center leading-6 text-primary-900 shadow-sm shadow-primary-100/50">
        {email
          ? `ส่งลิงก์ไปที่ ${email}`
          : 'เปิดอีเมลของคุณและกดลิงก์ยืนยันบัญชี'}
      </Text>
    </AuthScaffold>
  );
}
