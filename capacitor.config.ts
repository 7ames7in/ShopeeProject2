import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shopee.ai.draftcreator',
  appName: 'Shopee AI Draft Creator',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'native',
    },
  },
};

export default config;
