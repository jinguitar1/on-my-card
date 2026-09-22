import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { SoundProvider } from './src/feedback/sound';
import RootNavigator from './src/navigation/RootNavigator';
import { configureNotifications } from './src/notifications/scheduler';
import { AppProvider } from './src/state/AppStateContext';

/**
 * On My Card — a yearly life bingo card where a line of five is a goal.
 * Built on the five-part app model + the behavioral science of goal achievement.
 * See DESIGN-FRAMEWORK.md.
 */
export default function App() {
  useEffect(() => {
    configureNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <SoundProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </SoundProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
