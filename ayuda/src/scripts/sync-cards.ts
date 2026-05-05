import 'dotenv/config';

import { Rarity } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

import { prisma } from '../infrastructure/prisma';

type CardFileInfo = {
  absolutePath: string;
  collection: string;
  theme: string;
  filename: string;
};

type StorageListEntry = {
  name: string;
  id: string | null;
};

const BUCKET_NAME = 'game-assets';
const STORAGE_BASE_PATH = 'cards';
const BUCKET_CONFIG = {
  public: true,
  allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg'],
  fileSizeLimit: 10 * 1024 * 1024,
};

const RARITY_TOKENS: Array<{ token: string; rarity: Rarity }> = [
  { token: 'legendary', rarity: Rarity.LEGENDARY },
  { token: 'epic', rarity: Rarity.EPIC },
  { token: 'special', rarity: Rarity.SPECIAL },
  { token: 'uncommon', rarity: Rarity.UNCOMMON },
  { token: 'rare', rarity: Rarity.UNCOMMON },
  { token: 'common', rarity: Rarity.COMMON },
];

const CLEANUP_FLAGS = new Set(['--cleanup', '-c', 'cleanup']);

function normalizePathPart(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

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

function inferRarity(rawNameWithoutExt: string): Rarity {
  const normalized = rawNameWithoutExt.toLowerCase();

  for (const { token, rarity } of RARITY_TOKENS) {
    const pattern = new RegExp(`(?:_|-|\\s)${token}(?:_|-|\\s|$)`, 'i');
    if (pattern.test(normalized)) return rarity;
  }

  return Rarity.COMMON;
}

function cleanTitleBase(rawNameWithoutExt: string): string {
  let cleaned = rawNameWithoutExt;

  for (const { token } of RARITY_TOKENS) {
    const pattern = new RegExp(`(?:_|-|\\s)${token}(?=$|_|-|\\s)`, 'gi');
    cleaned = cleaned.replace(pattern, ' ');
  }

  return toDisplayName(cleaned);
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

async function walkDirectoryRecursively(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absoluteEntryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkDirectoryRecursively(absoluteEntryPath)));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') {
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

function parseCardFile(
  rootDir: string,
  absolutePath: string,
): CardFileInfo | null {
  const relativePath = path.relative(rootDir, absolutePath);
  const segments = relativePath.split(path.sep);

  if (segments.length < 3) {
    return null;
  }

  const collection = normalizePathPart(segments[0]);
  const theme = normalizePathPart(segments[1]);
  const filename = segments[segments.length - 1];

  return {
    absolutePath,
    collection,
    theme,
    filename,
  };
}

async function syncCards() {
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
  const inputCardsPath = scriptArgs.find((arg) => !CLEANUP_FLAGS.has(arg));
  const cardsRoot = inputCardsPath
    ? path.resolve(process.cwd(), inputCardsPath)
    : path.resolve(process.cwd(), 'Cartas');

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await ensureBucketExists(supabase);

  console.log(`Escaneando directorio: ${cardsRoot}`);
  await fs.access(cardsRoot);

  const pngFiles = await walkDirectoryRecursively(cardsRoot);
  console.log(`Archivos PNG detectados: ${pngFiles.length}`);

  let createdCollections = 0;
  let createdCards = 0;
  let updatedCards = 0;
  let skippedFiles = 0;
  let deletedCards = 0;
  let deletedStorageFiles = 0;
  const collectionCache = new Map<string, { id: number }>();
  const processedTitles = new Set<string>();
  const processedStoragePaths = new Set<string>();

  await prisma.$connect();

  for (const absolutePath of pngFiles) {
    const parsed = parseCardFile(cardsRoot, absolutePath);

    if (!parsed) {
      skippedFiles += 1;
      console.warn(`Saltado por formato invalido: ${absolutePath}`);
      continue;
    }

    const filenameWithoutExt = path.parse(parsed.filename).name;
    const inferredRarity = inferRarity(filenameWithoutExt);
    const cleanCardName = cleanTitleBase(filenameWithoutExt);
    const title = `${toDisplayName(parsed.theme)} - ${cleanCardName}`;

    let collectionInfo = collectionCache.get(parsed.collection);

    if (!collectionInfo) {
      const existingCollection = await prisma.collection.findUnique({
        where: { name: parsed.collection },
        select: { id_collection: true },
      });

      if (existingCollection) {
        collectionInfo = {
          id: existingCollection.id_collection,
        };
      } else {
        const createdCollection = await prisma.collection.create({
          data: { name: parsed.collection },
          select: { id_collection: true },
        });

        collectionInfo = {
          id: createdCollection.id_collection,
        };
        createdCollections += 1;
      }

      collectionCache.set(parsed.collection, collectionInfo);
    }

    const storagePath = [
      STORAGE_BASE_PATH,
      sanitizeForStorageKey(parsed.collection),
      sanitizeForStorageKey(parsed.theme),
      sanitizeForStorageKey(parsed.filename),
    ]
      .map((part) => part.replace(/(^\/|\/$)/g, ''))
      .join('/');

    const fileBuffer = await fs.readFile(parsed.absolutePath);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        upsert: false,
        contentType: 'image/png',
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

    const existingCard = await prisma.cards.findUnique({
      where: { title },
      select: { id_card: true },
    });

    await prisma.cards.upsert({
      where: { title },
      update: {
        url_image: publicUrl,
        rarity: inferredRarity,
        id_collection: collectionInfo.id,
      },
      create: {
        title,
        url_image: publicUrl,
        rarity: inferredRarity,
        id_collection: collectionInfo.id,
      },
    });

    if (existingCard) {
      updatedCards += 1;
    } else {
      createdCards += 1;
    }

    processedTitles.add(title);
    processedStoragePaths.add(storagePath);

    console.log(
      `Sincronizada: ${title} | Coleccion: ${parsed.collection} | Rarity: ${inferredRarity}`,
    );
  }

  if (cleanupEnabled) {
    console.log('\nIniciando fase de cleanup...');

    const deleteCardsResult = await prisma.cards.deleteMany({
      where: {
        title: {
          notIn: Array.from(processedTitles),
        },
      },
    });
    deletedCards = deleteCardsResult.count;

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
  console.log(`- Colecciones nuevas: ${createdCollections}`);
  console.log(`- Cartas creadas: ${createdCards}`);
  console.log(`- Cartas actualizadas: ${updatedCards}`);
  console.log(`- Archivos omitidos: ${skippedFiles}`);
  if (cleanupEnabled) {
    console.log(`- Cartas eliminadas (DB): ${deletedCards}`);
    console.log(`- Archivos eliminados (Storage): ${deletedStorageFiles}`);
  }
}

void syncCards()
  .catch((error) => {
    console.error('Error en sync-cards:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
