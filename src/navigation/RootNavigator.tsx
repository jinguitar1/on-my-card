import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, View } from 'react-native';

import { CelebrationOverlay } from '../feedback/Celebration';
import { useApp } from '../state/AppStateContext';
import CardScreen from '../screens/CardScreen';
import OnboardingNavigator from '../screens/OnboardingNavigator';
import RewardsScreen from '../screens/RewardsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TileSheetScreen from '../screens/TileSheetScreen';
import { colors } from '../ui/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabIcon = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.4 }}>{emoji}</Text>
);

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
      }}
    >
      <Tab.Screen name="Card" component={CardScreen} options={{ tabBarIcon: tabIcon('🃏') }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ tabBarIcon: tabIcon('🎟️') }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: tabIcon('⚙️') }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { ready, state, celebration, dismissCelebration } = useApp();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!state.settings.onboardingComplete || !state.card) {
    return <OnboardingNavigator />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="TileSheet" component={TileSheetScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
      <CelebrationOverlay payload={celebration} onDismiss={dismissCelebration} />
    </NavigationContainer>
  );
}
