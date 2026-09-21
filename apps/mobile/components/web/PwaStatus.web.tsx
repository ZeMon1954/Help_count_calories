import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showInstall, setShowInstall] = useState(() => !isStandalone());

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && !showInstall) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className={`absolute bottom-24 left-4 right-4 z-50 rounded-2xl px-4 py-3 shadow-lg ${
        online ? 'bg-slate-900' : 'bg-amber-700'
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-sm leading-5 text-white">
          {online
            ? 'ติดตั้งบน iPhone: เปิดด้วย Safari แล้วแตะ แชร์ → เพิ่มไปยังหน้าจอโฮม'
            : 'ออฟไลน์อยู่ ข้อมูลจากเซิร์ฟเวอร์และการบันทึกใหม่จะยังใช้งานไม่ได้'}
        </Text>
        {online ? (
          <Pressable
            accessibilityLabel="ซ่อนคำแนะนำติดตั้ง"
            accessibilityRole="button"
            className="min-h-11 min-w-11 items-center justify-center"
            onPress={() => setShowInstall(false)}
          >
            <Text className="text-lg font-bold text-white">×</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
