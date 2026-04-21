import { ActiveGameBanner } from '@/components/active-game-banner';
import { GameSessionProvider, useGameSession } from '@/contexts/game-session-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

function RootNavigator() {
  const pathname = usePathname();
  const { activeGameId, reconnectToActiveGame } = useGameSession();
  const isPublicRoute = pathname === '/' || pathname === '/login' || pathname === '/register';

  return (
    <View style={{ flex: 1 }}>
      {activeGameId && pathname !== '/gameScreen' && !isPublicRoute ? (
        <SafeAreaView style={{ paddingHorizontal: 12, paddingTop: 8 }}>
          <ActiveGameBanner
            subtitle="Tienes una partida en curso. Puedes volver cuando quieras."
            onPress={() => reconnectToActiveGame()}
          />
        </SafeAreaView>
      ) : null}
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="main" />
          <Stack.Screen name="gameScreen" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="setting" />
          <Stack.Screen name="store" />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GameSessionProvider>
        <RootNavigator />
      </GameSessionProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
