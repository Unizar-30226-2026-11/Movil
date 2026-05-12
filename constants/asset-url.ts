import { API_URL } from './api';

const apiOrigin = API_URL.replace(/\/api\/?$/, '');

const safeParseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const normalizeRemoteAssetUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmedValue = value.trim();
  const parsedUrl = safeParseUrl(trimmedValue);

  if (!parsedUrl) {
    return encodeURI(trimmedValue);
  }

  const normalizedApiUrl = safeParseUrl(apiOrigin);
  if (
    normalizedApiUrl &&
    ['localhost', '127.0.0.1'].includes(parsedUrl.hostname.toLowerCase())
  ) {
    parsedUrl.protocol = normalizedApiUrl.protocol;
    parsedUrl.hostname = normalizedApiUrl.hostname;
    parsedUrl.port = normalizedApiUrl.port;
  }

  return encodeURI(parsedUrl.toString());
};
