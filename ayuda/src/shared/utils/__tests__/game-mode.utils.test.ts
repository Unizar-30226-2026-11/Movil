import { normalizeGameMode } from '../game-mode.utils';

describe('normalizeGameMode', () => {
  test('normaliza valores legacy e internos al formato del motor', () => {
    expect(normalizeGameMode('Classic')).toBe('STANDARD');
    expect(normalizeGameMode('STANDARD')).toBe('STANDARD');
    expect(normalizeGameMode('Stella')).toBe('STELLA');
    expect(normalizeGameMode('STELLA')).toBe('STELLA');
  });

  test('devuelve null si el modo no es reconocible', () => {
    expect(normalizeGameMode('')).toBeNull();
    expect(normalizeGameMode('otro')).toBeNull();
    expect(normalizeGameMode(undefined)).toBeNull();
  });
});
