import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, LinkingOptions, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AccessScreen from './src/screens/AccessScreen';
import AssistantScreen from './src/screens/AssistantScreen';
import HealthScreen from './src/screens/HealthScreen';
import HomeScreen from './src/screens/HomeScreen';
import LoginScreen from './src/screens/LoginScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ProfileSectionScreen from './src/screens/ProfileSectionScreen';
import { SessionProvider, useSession } from './src/session';
import { colors } from './src/theme';
import { IconName } from './src/ui';

// oneprofile://access, oneprofile://health?tab=bills, … (in Expo Go: exp://<host>:8081/--/access).
// Lets a "new access request" notification open straight to the review screen.
const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [Linking.createURL('/'), 'oneprofile://'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Access: 'access',
          Profile: { screens: { ProfileHome: 'profile', ProfileSection: 'profile/:scope' } },
          Health: 'health',
          Assistant: 'assistant',
        },
      },
      Login: 'login',
    },
  },
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

const tabIcons: Record<string, [IconName, IconName]> = {
  Home: ['home', 'home-outline'],
  Access: ['shield-checkmark', 'shield-checkmark-outline'],
  Profile: ['person-circle', 'person-circle-outline'],
  Health: ['heart', 'heart-outline'],
  Assistant: ['sparkles', 'sparkles-outline'],
};

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: colors.bg } }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'My profile', headerLargeTitle: true }} />
      <ProfileStack.Screen
        name="ProfileSection"
        component={ProfileSectionScreen}
        options={({ route }: any) => ({ title: route.params?.title ?? '', headerBackTitle: 'Profile' })}
      />
    </ProfileStack.Navigator>
  );
}

function Tabs() {
  const { pending } = useSession();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={tabIcons[route.name][focused ? 0 : 1]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Access" component={AccessScreen} options={{ tabBarBadge: pending.length || undefined }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} />
      <Tab.Screen name="Health" component={HealthScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready, user } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? <Stack.Screen name="Main" component={Tabs} /> : <Stack.Screen name="Login" component={LoginScreen} />}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer linking={linking} theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary } }}>
          <StatusBar style="dark" />
          <Root />
        </NavigationContainer>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
