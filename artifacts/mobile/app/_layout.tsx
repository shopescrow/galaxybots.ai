import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, Redirect, useSegments, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import React, { useEffect, useRef } from "react";
import { Platform, View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ClientProvider } from "@/lib/client-context";
import colors from "@/constants/colors";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "GalaxyBots",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#6366F1",
  });
}

const ALLOWED_ROUTE_PREFIXES = [
  "/(tabs)",
  "/chat/",
  "/approval/",
  "/roi/",
  "/mission/",
];

const WEB_TO_MOBILE_ROUTE_MAP: Record<string, string> = {
  "/command-center": "/(tabs)",
  "/analytics": "/(tabs)",
  "/bots": "/(tabs)",
  "/governance": "/(tabs)/governance",
  "/approvals": "/(tabs)/governance",
  "/missions": "/(tabs)/missions",
  "/knowledge": "/(tabs)/knowledge",
  "/journal": "/(tabs)/settings",
  "/settings": "/(tabs)/settings",
  "/notifications": "/(tabs)",
};

function resolveRoute(route: string): string | null {
  if (ALLOWED_ROUTE_PREFIXES.some((prefix) => route.startsWith(prefix))) {
    return route;
  }
  const mapped = WEB_TO_MOBILE_ROUTE_MAP[route];
  if (mapped) return mapped;
  const approvalMatch = route.match(/^\/approval\/(\d+)$/);
  if (approvalMatch) return `/approval/${approvalMatch[1]}`;
  const roiMatch = route.match(/^\/roi\/client\/(\d+)$/);
  if (roiMatch) return `/roi/${roiMatch[1]}`;
  const chatMatch = route.match(/^\/chat\/(\d+)$/);
  if (chatMatch) return `/chat/${chatMatch[1]}`;
  const missionMatch = route.match(/^\/mission\/(\d+)$/);
  if (missionMatch) return `/mission/${missionMatch[1]}`;
  return null;
}

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.light.background }}>
        <ActivityIndicator size="large" color={colors.light.tint} />
      </View>
    );
  }

  const AUTH_SCREENS = ["login", "forgot-password", "forgot-username"];
  const inAuthGroup = AUTH_SCREENS.includes(segments[0] as string);

  if (!isAuthenticated && !inAuthGroup) {
    return <Redirect href="/login" />;
  }

  if (isAuthenticated && inAuthGroup) {
    return <Redirect href="/(tabs)" />;
  }

  return <>{children}</>;
}

function NotificationHandler() {
  const router = useRouter();
  const responseListener = useRef<{ remove(): void } | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) {
          const data = response.notification.request.content.data as Record<
            string,
            string
          >;
          const resolved = data?.route ? resolveRoute(data.route) : null;
          if (resolved) {
            router.push(resolved as never);
          }
        }
      });
    }

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<
          string,
          string
        >;
        const resolved = data?.route ? resolveRoute(data.route) : null;
        if (resolved) {
          router.push(resolved as never);
        }
      });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router]);

  return null;
}

function RootLayoutNav() {
  return (
    <AuthGate>
      <NotificationHandler />
      <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="forgot-username" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[botId]"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="approval/[id]"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="roi/[clientId]"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="mission/[id]"
          options={{ headerShown: false, presentation: "card" }}
        />
        <Stack.Screen
          name="mission/new"
          options={{ headerShown: false, presentation: "modal" }}
        />
      </Stack>
    </AuthGate>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <ClientProvider>
                  <RootLayoutNav />
                </ClientProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
