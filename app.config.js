// Dynamic app config (replaces the old static app.json) so the dev-client build can use
// its own bundle identifier and app name instead of silently overwriting the TestFlight/
// App Store build on-device — iOS treats two builds with the same bundle id as the same
// app slot, so installing one used to clobber the other.
//
// APP_VARIANT defaults to "development": every local `expo run:ios`/`expo start` falls
// into this unless explicitly overridden, and only eas.json's `production` build profile
// sets APP_VARIANT=production. This fails safe — a forgotten override anywhere else lands
// on the dev identity rather than accidentally colliding with the real app.
const IS_DEV = process.env.APP_VARIANT !== 'production';

module.exports = {
  expo: {
    name: IS_DEV ? 'On My Card (Dev)' : 'On My Card',
    slug: 'on-my-card',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    backgroundColor: '#FBF6EA',
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.mooboomoo.on-my-card.dev' : 'com.mooboomoo.on-my-card',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-audio', 'expo-asset', '@react-native-community/datetimepicker', 'expo-secure-store', 'expo-font'],
    extra: {
      eas: {
        projectId: 'b27dcd6c-97f5-485c-8442-a450f1cbe67a',
      },
    },
    owner: 'mooboomoo',
  },
};
