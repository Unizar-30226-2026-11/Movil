// utils/lockManager.ts

// Usamos un Set para guardar los IDs de usuarios que tienen una transacción en curso
const activeLocks = new Set<string>();

export const LockManager = {
  // Intenta adquirir el bloqueo
  acquire: (userId: string): boolean => {
    if (activeLocks.has(userId)) return false; // Ya hay una compra en marcha
    activeLocks.add(userId);
    return true;
  },
  // Libera el bloqueo
  release: (userId: string): void => {
    activeLocks.delete(userId);
  },
};
