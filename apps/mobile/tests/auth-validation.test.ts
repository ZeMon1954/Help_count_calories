import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getThaiAuthError,
  validateEmail,
  validatePassword,
} from '../utils/auth-validation.js';

test('validates required and malformed email addresses', () => {
  assert.equal(validateEmail(''), 'กรุณากรอกอีเมล');
  assert.equal(validateEmail('invalid-email'), 'รูปแบบอีเมลไม่ถูกต้อง');
  assert.equal(validateEmail('person@example.com'), undefined);
});

test('validates the minimum password length', () => {
  assert.equal(validatePassword(''), 'กรุณากรอกรหัสผ่าน');
  assert.match(validatePassword('12345') ?? '', /อย่างน้อย 6/);
  assert.equal(validatePassword('123456'), undefined);
});

test('returns a safe Thai message for invalid credentials', () => {
  assert.equal(
    getThaiAuthError(new Error('Invalid login credentials')),
    'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  );
});
