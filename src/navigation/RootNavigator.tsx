import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { FEATURES } from '../config/features';
import { CelebrationOverlay } from '../feedback/Celebration';
import { useApp } from '../state/AppStateContext';
import CardDashboardScreen from '../screens/CardDashboardScreen';
import CardDetailScreen from '../screens/CardDetailScreen';
import CreateCardScreen from '../screens/CreateCardScreen';
import OnboardingNavigator from '../screens/OnboardingNavigator';
import RewardsScreen from '../screens/RewardsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SignInScreen from '../screens/auth/SignInScreen';
import TileEditScreen from '../screens/TileEditScreen';
import TileSheetScreen from '../screens/TileSheetScreen';
import TodayScreen from '../screens/TodayScreen';
import { colors } from '../ui/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const CardStackNav = createNativeStackNavigator();

// The Card tab is its own small stack — a dashboard listing every card, and a detail
// screen (opened by cardId) carrying the focus banner / stat pills / grid that used to
// live directly on the tab. Nesting a stack inside a tab screen is standard
// @react-navigation practice; a screen nested here can still reach sibling top-level
// screens like TileSheet/SignIn/CreateCard by name (React Navigation's `navigate` walks
// up through parent navigators to find them).
function CardStack() {
  return (
    <CardStackNav.Navigator screenOptions={{ headerShown: false }}>
      <CardStackNav.Screen name="CardDashboard" component={CardDashboardScreen} />
      <CardStackNav.Screen name="Today" component={TodayScreen} />
      <CardStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    </CardStackNav.Navigator>
  );
}

// `dot`: a small always-on cue (currently used to flag "not signed in" on the
// Settings tab) so sign-in stays findable from anywhere in the app, not just the
// Card-tab banner or the Settings row itself.
const tabIcon = (emoji: string, dot?: boolean) => ({ focused }: { focused: boolean }) => (
  <View>
    <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.4 }}>{emoji}</Text>
    {dot && <View style={styles.tabDot} />}
  </View>
);

function Tabs() {
  const { status } = useAuth();
  const signedOut = status === 'signedOut';
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
      <Tab.Screen name="Card" component={CardStack} options={{ tabBarIcon: tabIcon('🃏'), tabBarLabel: 'Home' }} />
      {FEATURES.rewards && (
        <Tab.Screen name="Rewards" component={RewardsScreen} options={{ tabBarIcon: tabIcon('🎟️') }} />
      )}
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: tabIcon('⚙️', signedOut) }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.stampGold,
  },
});

export default function RootNavigator() {
  const { ready, state, celebration, dismissCelebration } = useApp();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!state.settings.onboardingComplete || state.cards.length === 0) {
    return <OnboardingNavigator />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        {/* transparentModal (not the old opaque 'modal') keeps the grid mounted and
            visible underneath — the whole point being that a tile's sheet should feel
            like it's sitting on top of the card, not replacing it with a new page. */}
        <Stack.Screen
          name="TileSheet"
          component={TileSheetScreen}
          options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen
          name="TileEdit"
          component={TileEditScreen}
          options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
        />
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="CreateCard" component={CreateCardScreen} options={{ presentation: 'modal' }} />
      </Stack.Navigator>
      <CelebrationOverlay payload={celebration} onDismiss={dismissCelebration} />
    </NavigationContainer>
  );
}
