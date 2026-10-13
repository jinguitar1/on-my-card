import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthContext';
import { SoundProvider } from './src/feedback/sound';
import RootNavigator from './src/navigation/RootNavigator';
import { configureNotifications } from './src/notifications/scheduler';
import { AppProvider } from './src/state/AppStateContext';
import { colors } from './src/ui/theme';

/**
 * On My Card — a yearly life bingo card where a line of five is a goal.
 * Built on the five-part app model + the behavioral science of goal achievement.
 * See DESIGN-FRAMEWORK.md.
 */
export default function App() {
  useEffect(() => {
    configureNotifications();
  }, []);

  // The "quiet" redesign's two typefaces (ui/theme.ts's `type.quiet*` tokens) — loaded
  // once here, same as every other provider-level setup, rather than per-screen.
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

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
