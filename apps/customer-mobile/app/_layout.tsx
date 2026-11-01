import { Stack } from 'expo-router';
import { NativeTypography } from '@convyn/mobile-ui';
const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: '#fff' },
};
export default function Layout() {
  return (
    <NativeTypography>
      <Stack screenOptions={screenOptions} />
    </NativeTypography>
  );
}
