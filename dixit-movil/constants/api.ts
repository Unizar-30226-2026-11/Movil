const DEFAULT_API_URL = 'http://172.20.10.7:3000/api';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
