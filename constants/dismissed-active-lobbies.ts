import AsyncStorage from '@react-native-async-storage/async-storage';

export const DISMISSED_ACTIVE_LOBBY_STORAGE_KEY = 'dismissedActiveLobbyCode';

const normalizeLobbyCode = (value: unknown) => String(value ?? '').trim().toUpperCase();

export const readDismissedActiveLobbyCodes = async (): Promise<string[]> => {
  const rawValue = await AsyncStorage.getItem(DISMISSED_ACTIVE_LOBBY_STORAGE_KEY);

  if (!rawValue) return [];

  try {
    const parsedValue = JSON.parse(rawValue);
    if (Array.isArray(parsedValue)) {
      return Array.from(
        new Set(parsedValue.map(normalizeLobbyCode).filter(Boolean))
      );
    }
  } catch {
    // Compatibilidad con el formato antiguo: un solo código en texto plano.
  }

  const legacyCode = normalizeLobbyCode(rawValue);
  return legacyCode ? [legacyCode] : [];
};

export const addDismissedActiveLobbyCode = async (lobbyCode: string) => {
  const normalizedLobbyCode = normalizeLobbyCode(lobbyCode);
  if (!normalizedLobbyCode) return;

  const dismissedLobbyCodes = await readDismissedActiveLobbyCodes();
  const nextDismissedLobbyCodes = Array.from(
    new Set([...dismissedLobbyCodes, normalizedLobbyCode])
  );

  await AsyncStorage.setItem(
    DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
    JSON.stringify(nextDismissedLobbyCodes)
  );
};

export const removeDismissedActiveLobbyCode = async (lobbyCode: string) => {
  const normalizedLobbyCode = normalizeLobbyCode(lobbyCode);
  if (!normalizedLobbyCode) return;

  const dismissedLobbyCodes = await readDismissedActiveLobbyCodes();
  const nextDismissedLobbyCodes = dismissedLobbyCodes.filter(
    (storedLobbyCode) => storedLobbyCode !== normalizedLobbyCode
  );

  if (nextDismissedLobbyCodes.length === 0) {
    await AsyncStorage.removeItem(DISMISSED_ACTIVE_LOBBY_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(
    DISMISSED_ACTIVE_LOBBY_STORAGE_KEY,
    JSON.stringify(nextDismissedLobbyCodes)
  );
};

export const clearDismissedActiveLobbyCodes = async () => {
  await AsyncStorage.removeItem(DISMISSED_ACTIVE_LOBBY_STORAGE_KEY);
};
