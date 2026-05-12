// src/constants/validation.ts

/**
 * Solo permite letras, números y guiones bajos.
 * Evita inyecciones básicas y caracteres especiales problemáticos en URLs.
 */
export const ID_SAFE_REGEX = /^[a-zA-Z0-9_]+$/;
// Añadimos el regex específico para salas
export const LOBBY_CODE_REGEX = /^[A-Z0-9]{4,6}$/;

export const LOBBY_MIN_PLAYERS = 2;
export const LOBBY_MAX_PLAYERS = 6;

/**
 * Opcional: Si IDs siempre tienen una longitud fija (ej: u_ + 10 caracteres)
 */
export const ID_MAX_LENGTH = 30;
export const ID_MIN_LENGTH = 3;
