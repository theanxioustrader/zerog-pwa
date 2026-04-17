import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zerog.companion',
  appName: 'ZeroG',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Allow cleartext traffic to bridge during dev
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
