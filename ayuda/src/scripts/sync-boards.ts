import 'dotenv/config';

import { Board_Type } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

import { prisma } from '../infrastructure/prisma';

type BoardFileInfo = {
  absolutePath: string;
  filename: string;
  boardName: string;
  description: string;
  price: number;
};

type StorageListEntry = {
  name: string;
  id: string | null;
};

const BUCKET_NAME = 'game-assets';
const STORAGE_BASE_PATH = 'boards';
const BUCKET_CONFIG = {
  public: true,
  allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg'],
  fileSizeLimit: 10 * 1024 * 1024,
};

const DEFAULT_BOARD_PRICE = 2000;
const CLEANUP_FLAGS = new Set(['--cleanup', '-c', 'cleanup']);

const BOARD_METADATA: Record<string, { description: string; price: number }> = {
  [Board_Type.CLASSIC]: {
    description: 'El tablero original de madera y estrellas.',
    price: 0,
  },
  [Board_Type.NEON]: {
    description: 'Un estilo futurista con luces vibrantes y efectos ciberpunk.',
    price: DEFAULT_BOARD_PRICE,
  },
  [Board_Type.STELLAR_GALAXY]: {
    description: 'Viaja a través del cosmos con este tablero espacial.',
    price: DEFAULT_BOARD_PRICE,
  },
};

function toDisplayName(raw: string): string {
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeForStorageKey(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function toBoardName(rawNameWithoutExt: string): string {
  return sanitizeForStorageKey(rawNameWithoutExt)
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toUpperCase();
}

function extractPriceSuffix(rawNameWithoutExt: string): {
  baseName: string;
  priceOverride: number | null;
} {
  const match = rawNameWithoutExt.match(/^(.*?)-([0-9]+)$/);

  if (!match) {
    return {
      baseName: rawNameWithoutExt,
      priceOverride: null,
    };
  }

  const baseName = match[1].trim();
  const parsedPrice = Number.parseInt(match[2], 10);

  if (!baseName || Number.isNaN(parsedPrice)) {
    return {
      baseName: rawNameWithoutExt,
      priceOverride: null,
    };
  }

  return {
    baseName,
    priceOverride: parsedPrice,
  };
}

function getBoardMetadata(boardName: string, rawNameWithoutExt: string) {
  return (
    BOARD_METADATA[boardName] ?? {
      description: `Tablero ${toDisplayName(rawNameWithoutExt)}`,
      price: DEFAULT_BOARD_PRICE,
    }
  );
}

function isBucketMissingError(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('not found') ||
    normalizedMessage.includes('does not exist')
  );
}

function isAlreadyExistsUploadError(error: {
  message?: string;
  status?: number | string;
  statusCode?: number | string;
}): boolean {
  const normalizedMessage = (error.message ?? '').toLowerCase();
  const status = Number(error.status ?? error.statusCode);

  return normalizedMessage.includes('already exists') || status === 409;
}

function getContentType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';

  return null;
}

async function ensureBucketExists(supabase: SupabaseClient): Promise<void> {
  console.log(`Verificando el bucket '${BUCKET_NAME}'...`);

  const { error: getBucketError } =
    await supabase.storage.getBucket(BUCKET_NAME);

  if (!getBucketError) {
    const { error: updateError } = await supabase.storage.updateBucket(
      BUCKET_NAME,
      BUCKET_CONFIG,
    );

    if (updateError) {
      throw new Error(
        `Error al actualizar la configuracion del bucket: ${updateError.message}`,
      );
    }

    console.log(
      `✅ El bucket '${BUCKET_NAME}' ya existe y quedó configurado como público.`,
    );
    return;
  }

  if (!isBucketMissingError(getBucketError.message)) {
    throw new Error(`Error al verificar el bucket: ${getBucketError.message}`);
  }

  console.log(
    `El bucket no existe. Creando bucket público '${BUCKET_NAME}'...`,
  );

  const { error: createError } = await supabase.storage.createBucket(
    BUCKET_NAME,
    BUCKET_CONFIG,
  );

  if (createError) {
    throw new Error(`Fallo al crear el bucket: ${createError.message}`);
  }

  console.log('✅ Bucket creado con éxito.');
}

async function walkBoardFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const absoluteEntryPath = path.join(dir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    if (['.png', '.webp', '.jpg', '.jpeg'].includes(ext)) {
      files.push(absoluteEntryPath);
    }
  }

  return files;
}

async function listStorageFilesRecursively(
  supabase: SupabaseClient,
  bucketName: string,
  currentPath: string,
): Promise<string[]> {
  const collected: string[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(currentPath, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      throw new Error(
        `Error al listar el bucket en '${currentPath}': ${error.message}`,
      );
    }

    const entries = (data ?? []) as StorageListEntry[];

    if (entries.length === 0) {
      break;
    }

    for (const entry of entries) {
      const entryPath = currentPath
        ? `${currentPath}/${entry.name}`
        : entry.name;

      if (entry.id === null) {
        const nestedFiles = await listStorageFilesRecursively(
          supabase,
          bucketName,
          entryPath,
        );
        collected.push(...nestedFiles);
      } else {
        collected.push(entryPath);
      }
    }

    if (entries.length < limit) {
      break;
    }

    offset += limit;
  }

  return collected;
}

async function removeStoragePaths(
  supabase: SupabaseClient,
  bucketName: string,
  paths: string[],
): Promise<number> {
  const chunkSize = 100;
  let removed = 0;

  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove(chunk);

    if (error) {
      throw new Error(
        `Error al eliminar archivos del storage: ${error.message}`,
      );
    }

    removed += data?.length ?? 0;
  }

  return removed;
}

function parseBoardFile(absolutePath: string): BoardFileInfo | null {
  const filename = path.basename(absolutePath);
  const extension = path.extname(filename);

  if (!extension) {
    return null;
  }

  const rawNameWithoutExt = path.parse(filename).name;
  const { baseName, priceOverride } = extractPriceSuffix(rawNameWithoutExt);
  const boardName = toBoardName(baseName);
  const metadata = getBoardMetadata(boardName, baseName);

  return {
    absolutePath,
    filename,
    boardName,
    description: metadata.description,
    price: priceOverride ?? metadata.price,
  };
}

async function syncBoards() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL no esta configurada.');
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el script.',
    );
  }

  const scriptArgs = process.argv.slice(2);
  const cleanupEnabled = scriptArgs.some((arg) => CLEANUP_FLAGS.has(arg));
  const inputBoardsPath = scriptArgs.find((arg) => !CLEANUP_FLAGS.has(arg));
  const boardsRoot = inputBoardsPath
    ? path.resolve(process.cwd(), inputBoardsPath)
    : path.resolve(process.cwd(), 'Tableros');

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await ensureBucketExists(supabase);

  console.log(`Escaneando directorio: ${boardsRoot}`);
  await fs.access(boardsRoot);

  const boardFiles = await walkBoardFiles(boardsRoot);
  console.log(`Archivos de tablero detectados: ${boardFiles.length}`);

  let createdBoards = 0;
  let updatedBoards = 0;
  let skippedFiles = 0;
  let deletedBoards = 0;
  let deletedStorageFiles = 0;
  const processedBoardNames = new Set<string>();
  const processedStoragePaths = new Set<string>();

  await prisma.$connect();

  for (const absolutePath of boardFiles) {
    const parsed = parseBoardFile(absolutePath);

    if (!parsed) {
      skippedFiles += 1;
      console.warn(`Saltado por formato invalido: ${absolutePath}`);
      continue;
    }

    const contentType = getContentType(parsed.filename);

    if (!contentType) {
      skippedFiles += 1;
      console.warn(`Saltado por tipo no soportado: ${absolutePath}`);
      continue;
    }

    const storagePath = [
      STORAGE_BASE_PATH,
      sanitizeForStorageKey(parsed.filename),
    ]
      .map((part) => part.replace(/(^\/|\/$)/g, ''))
      .join('/');

    const fileBuffer = await fs.readFile(parsed.absolutePath);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        upsert: false,
        contentType,
      });

    if (uploadError) {
      if (isAlreadyExistsUploadError(uploadError)) {
        console.log(
          `Archivo ya existente en bucket, se omite subida: ${storagePath}`,
        );
      } else {
        throw new Error(
          `Fallo al subir ${parsed.absolutePath} a ${storagePath}: ${uploadError.message}`,
        );
      }
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    const existingBoard = await prisma.board.findUnique({
      where: { name: parsed.boardName },
      select: { id_board: true },
    });

    await prisma.board.upsert({
      where: { name: parsed.boardName },
      update: {
        description: parsed.description,
        price: parsed.price,
        url_image: publicUrl,
      },
      create: {
        name: parsed.boardName,
        description: parsed.description,
        price: parsed.price,
        url_image: publicUrl,
      },
    });

    if (existingBoard) {
      updatedBoards += 1;
    } else {
      createdBoards += 1;
    }

    processedBoardNames.add(parsed.boardName);
    processedStoragePaths.add(storagePath);

    console.log(
      `Sincronizado: ${parsed.boardName} | Precio: ${parsed.price} | Archivo: ${contentType}`,
    );
  }

  if (cleanupEnabled) {
    console.log('\nIniciando fase de cleanup...');

    const deleteBoardsResult = await prisma.board.deleteMany({
      where: {
        name: {
          notIn: Array.from(processedBoardNames),
        },
      },
    });
    deletedBoards = deleteBoardsResult.count;

    const allStorageFiles = await listStorageFilesRecursively(
      supabase,
      BUCKET_NAME,
      STORAGE_BASE_PATH,
    );

    const storageToDelete = allStorageFiles.filter(
      (storagePath) => !processedStoragePaths.has(storagePath),
    );

    if (storageToDelete.length > 0) {
      deletedStorageFiles = await removeStoragePaths(
        supabase,
        BUCKET_NAME,
        storageToDelete,
      );
    }

    console.log('✅ Cleanup completado.');
  }

  console.log('\nResumen de sincronizacion');
  console.log(`- Tableros nuevos: ${createdBoards}`);
  console.log(`- Tableros actualizados: ${updatedBoards}`);
  console.log(`- Archivos omitidos: ${skippedFiles}`);
  if (cleanupEnabled) {
    console.log(`- Tableros eliminados (DB): ${deletedBoards}`);
    console.log(`- Archivos eliminados (Storage): ${deletedStorageFiles}`);
  }
}

void syncBoards()
  .catch((error) => {
    console.error('Error en sync-boards:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
