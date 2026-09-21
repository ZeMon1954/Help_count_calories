import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

interface State {
  failed: boolean;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void error;
    void info;
    if (__DEV__) console.error('[Diagnostics] Root render failed');
  }

  private retry = () => {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    this.setState({ failed: false });
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center gap-4 bg-slate-50 px-6">
        <Text className="text-center text-xl font-bold text-slate-900">
          เปิดแอปไม่สำเร็จ
        </Text>
        <Text className="text-center text-slate-600">
          เกิดข้อผิดพลาดระหว่างเริ่มต้นแอป กรุณาลองโหลดใหม่
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-12 justify-center rounded-xl bg-emerald-600 px-6"
          onPress={this.retry}
        >
          <Text className="font-semibold text-white">โหลดใหม่</Text>
        </Pressable>
      </View>
    );
  }
}
