import Constants from 'expo-constants';

const DEFAULT_API_URL = 'http://172.20.10.7:3000/api';
const extra = Constants.expoConfig?.extra ?? {};

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (typeof extra.EXPO_PUBLIC_API_URL === 'string' ? extra.EXPO_PUBLIC_API_URL : DEFAULT_API_URL);

export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ??
  (typeof extra.EXPO_PUBLIC_SOCKET_URL === 'string'
    ? extra.EXPO_PUBLIC_SOCKET_URL
    : API_URL.replace(/\/api\/?$/, ''));
