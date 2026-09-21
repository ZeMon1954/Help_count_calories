# PWA / Vercel readiness report

วันที่ตรวจ: 2026-09-21

## สถานะ

**พร้อมสำหรับการตรวจ Preview deployment แต่ยังไม่ได้ deploy**

Web export, TypeScript และ ESLint ผ่านในเครื่องแล้ว แอป native เดิมยังคงมี implementation แยกต่างหาก ส่วน production browser จะเรียก Render API ได้ต่อเมื่อกำหนด CORS allowlist และ redeploy API หลังทราบโดเมน Vercel จริง

ไม่มีการเปลี่ยน schema, migration, RLS, Supabase production data หรือ secrets ในงานนี้

## Baseline และผลตรวจจริง

- ก่อนแก้: `npx expo export --platform web` ผ่าน (1,503 modules, JS ประมาณ 3.2 MB)
- หลังแก้: `npm run build:web --workspace @ai-fitness/mobile` ผ่าน (1,439 modules, JS ประมาณ 3.1 MB)
- `npm run typecheck --workspace @ai-fitness/mobile` ผ่าน
- `npm run typecheck --workspace @ai-fitness/api` ผ่าน
- `npm run lint` ผ่าน
- PWA output มี `manifest.json`, `sw.js`, icon 192/512, Apple touch icon และ SPA `index.html`
- Automated test suite **ไม่ได้รันถึง test cases**: Node/tsx ล้มก่อนโหลด test ด้วย `uv_os_get_passwd returned ENOMEM` ทุกไฟล์ จึงไม่อ้างว่า tests ผ่าน
- ยังไม่ได้ทดสอบบน iPhone จริง, Lighthouse, Vercel Preview หรือ production domain

## สิ่งที่เปลี่ยน

### Authentication และ session

- Web ใช้ `localStorage` ผ่าน Supabase storage adapter และเปิด `persistSession`
- Native ยังคงใช้ chunked `expo-secure-store`
- เปิด Supabase auth URL detection บน Web สำหรับ recovery/callback
- ไม่มี service role key ใน frontend; Vercel ใช้ publishable/anon key เท่านั้น

### Web compatibility

- GPS บน Web เป็น foreground-only ผ่าน browser geolocation และ HTTPS
- แสดงข้อความชัดเจนว่าต้องเปิดแอปค้างไว้; การล็อกจอหรือสลับแอปอาจหยุด tracking
- Native background location/task implementation เดิมถูกแยกไว้ใน `.native.ts`
- Web ไม่เรียก native local notification API และบอกผู้ใช้ว่า Web Push ยังไม่รองรับ
- Native notification implementation เดิมยังอยู่ใน `.native.ts`
- Map ประวัติถูกซ่อนบน Web เพื่อลดความเสี่ยงจาก native-only map renderer
- Camera/gallery ยังใช้ Expo Image Picker; ต้องทดสอบ permission จริงบน Safari หลัง deploy HTTPS

### PWA

- Manifest ภาษาไทย, standalone portrait, theme/background colors
- Icon 192x192, 512x512 และ Apple touch icon 180x180
- Service worker cache เฉพาะ app shell และ static assets ของ origin เดียวกัน
- ไม่ cache API response, authenticated/private data หรือ mutation
- Offline mode แสดงสถานะตรงไปตรงมา: เปิด shell ได้บางส่วน แต่โหลด/บันทึกข้อมูล server ไม่ได้
- มีคำแนะนำ Safari: แชร์ → เพิ่มไปยังหน้าจอโฮม

### Render cold start

- GET requests retry ได้หนึ่งครั้งเมื่อเป็น network failure; mutation เช่น POST/PATCH/DELETE ไม่ retry อัตโนมัติ
- แต่ละ attempt timeout 75 วินาที และหน้า profile แสดงข้อความว่า server แผนฟรีอาจกำลังเริ่มทำงาน
- การ retry mutation ต้องให้ flow เดิมหรือผู้ใช้เป็นผู้สั่ง เพื่อหลีกเลี่ยง duplicate write

### Backend CORS (เตรียมใน source เท่านั้น)

- Production API เปลี่ยนจากปิด browser origins ทั้งหมดเป็น exact allowlist จาก `CORS_ALLOWED_ORIGINS`
- Request ที่ไม่มี Origin ยังใช้ได้สำหรับ native/server clients
- Development ยังอนุญาต origins เพื่อไม่ทำลาย local workflow
- ยังไม่ได้ deploy การเปลี่ยนนี้ไป Render

## วิธีตั้ง Vercel (เมื่อได้รับอนุมัติ deploy)

1. Import GitHub repository เดิมเข้า Vercel
2. ตั้ง **Root Directory** เป็น `apps/mobile`
3. Framework Preset เลือก `Other`
4. Build Command ใช้ `npm run build:web`
5. Output Directory ใช้ `dist`
6. ตั้ง Environment Variables สำหรับ Preview และ Production:
   - `EXPO_PUBLIC_API_URL=https://nub-cal-api.onrender.com/api`
   - `EXPO_PUBLIC_SUPABASE_URL=<Supabase Project URL>`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=<publishable หรือ anon key>`
7. ห้ามใส่ `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `GEMINI_API_KEY` หรือ secret ฝั่ง API ใน Vercel frontend
8. Deploy เป็น Preview ก่อน แล้วจด exact origin เช่น `https://ชื่อโปรเจกต์.vercel.app` (ไม่มี slash ท้าย)
9. ที่ Render กำหนด `CORS_ALLOWED_ORIGINS` เป็น exact Vercel origins คั่นด้วย comma แล้วจึง redeploy API source ที่ review แล้ว
10. ทดสอบ Preview ครบก่อน promote production

`vercel.json` ภายใน `apps/mobile` จัดการ SPA fallback และกำหนดให้ `sw.js` ไม่ถูก cache แบบระยะยาว

## Supabase ที่ต้องตั้งหลังทราบโดเมน

ใน Supabase Auth URL Configuration:

- ตั้ง Site URL เป็น production Vercel URL เมื่อพร้อม production
- เพิ่ม Preview/Production callback ที่อนุญาตสำหรับ reset password ตามนโยบายของโปรเจกต์
- ตรวจ email recovery link ว่ากลับมายัง `/reset-password`
- ไม่ต้องเปลี่ยน schema หรือ RLS สำหรับ PWA นี้

## Manual acceptance tests

### Desktop browser

1. เปิด Preview URL และตรวจ DevTools ว่า manifest กับ service worker ไม่มี error
2. สมัคร, ยืนยันอีเมล, login และ refresh หน้า; session ต้องยังอยู่
3. logout แล้ว refresh; ต้องกลับหน้า login
4. ทดสอบ forgot/reset password และ callback URL
5. ทดสอบ onboarding/profile, food search, custom food, diary add/edit/delete, nutrition summary
6. ทดสอบ AI scanner ด้วย JPEG/PNG/WebP ที่รองรับ
7. ทดสอบ workout, progress, settings และ activity tracking
8. เปิด Offline ใน DevTools: ต้องเห็น offline warning และไม่แสดงข้อความว่าบันทึก server สำเร็จ
9. ปิด/ปลุก Render API แล้วตรวจ cold-start loading และ GET retry

### iPhone Safari / installed PWA

1. เปิด HTTPS URL ใน Safari
2. แตะ Share → Add to Home Screen แล้วเปิดจาก icon
3. ทดสอบ safe areas, tabs, keyboard และทุก route
4. login แล้วปิด/เปิด PWA และ refresh; session ต้องคงอยู่
5. อนุญาต Camera/Photos และทดสอบ preview + AI analysis จริง
6. อนุญาต Location แล้วเริ่ม activity ขณะจอเปิด
7. สลับแอป/ล็อกจอเพื่อยืนยันข้อจำกัด foreground tracking (ห้ามคาดหวัง background tracking)
8. ยืนยันว่า reminder settings ถูกบันทึก แต่ไม่มี Web Push notification
9. เปิด airplane mode และตรวจ offline messaging

## ข้อจำกัดที่ยอมรับใน PWA รุ่นนี้

- ไม่มี reliable background GPS บน iPhone PWA; ต้องเปิดหน้าจอและให้แอปอยู่ foreground
- ยังไม่มี Web Push; reminder time บันทึกในระบบแต่ browser ไม่ส่ง notification
- Offline รองรับ app shell เท่านั้น ไม่รองรับอ่าน/เขียนข้อมูลสุขภาพแบบ offline sync
- Render free service อาจ cold start ทำให้คำขอแรกช้า
- Camera/gallery/location behavior ต้องยืนยันบน iPhone Safari ผ่าน HTTPS จริง
- Frontend environment variables ที่ขึ้นต้น `EXPO_PUBLIC_` มองเห็นได้ใน bundle จึงใช้ได้เฉพาะค่าที่ออกแบบให้ public

## Rollback

ไม่มี database migration ให้ rollback

- Vercel: rollback ไป deployment ก่อนหน้า หรือถอด custom domain จาก deployment ใหม่
- Render: rollback source deployment ก่อน CORS change และลบ/คืนค่า `CORS_ALLOWED_ORIGINS`
- Client: revert PWA/platform split commit; native API contract และฐานข้อมูลไม่ได้เปลี่ยน
- Service worker: เปลี่ยน `CACHE_NAME` เมื่อออกเวอร์ชันแก้ไข เพื่อให้ activate ลบ cache รุ่นเก่า

## Blockers ก่อน Production

1. Review และอนุมัติ deployment แยกต่างหาก
2. Deploy Preview และได้ exact Vercel origin
3. ตั้ง Render `CORS_ALLOWED_ORIGINS` และ redeploy API (จำเป็นสำหรับ browser)
4. ตั้ง Supabase Auth URLs
5. ผ่าน manual browser/iPhone tests และ Lighthouse/PWA inspection
6. แก้ environment issue ของ Node test runner แล้วรัน automated tests ใหม่

