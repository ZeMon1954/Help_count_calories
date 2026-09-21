export const PASSWORD_MIN_LENGTH = 6;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'กรุณากรอกอีเมล';
  if (!emailPattern.test(email.trim())) return 'รูปแบบอีเมลไม่ถูกต้อง';
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (!password) return 'กรุณากรอกรหัสผ่าน';
  if (password.length < PASSWORD_MIN_LENGTH)
    return `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`;
  return undefined;
}

export function isInvalidLoginCredentials(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('invalid login credentials')
  );
}

export function getThaiAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('invalid login credentials'))
    return 'ไม่พบบัญชีนี้ หรือรหัสผ่านไม่ถูกต้อง';
  if (message.includes('email not confirmed'))
    return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
  if (message.includes('user already registered'))
    return 'อีเมลนี้ถูกสมัครใช้งานแล้ว';
  if (message.includes('password')) return 'รหัสผ่านไม่ผ่านเงื่อนไขที่กำหนด';
  if (message.includes('rate limit'))
    return 'มีการร้องขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if (message.includes('network') || message.includes('fetch'))
    return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}
