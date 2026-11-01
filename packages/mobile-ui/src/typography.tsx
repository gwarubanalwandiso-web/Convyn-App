import { useFonts } from 'expo-font';
import { ActivityIndicator, View, Text } from 'react-native';
import type { ReactNode } from 'react';
// Expo resolves bundled TTF files through Metro’s static require mechanism.
/* eslint-disable @typescript-eslint/no-require-imports */
export function NativeTypography({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({
    Lato400: require('../assets/fonts/Lato-400.ttf'),
    Lato700: require('../assets/fonts/Lato-700.ttf'),
    Lato900: require('../assets/fonts/Lato-900.ttf'),
  });
  if (error)
    return (
      <View accessibilityRole="alert">
        <Text>CONVYN fonts could not load. Please restart the app.</Text>
      </View>
    );
  if (!loaded)
    return (
      <ActivityIndicator color="#000" accessibilityLabel="Loading CONVYN" />
    );
  return children;
}
