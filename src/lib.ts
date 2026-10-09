import { environment, getPreferenceValues } from "@raycast/api";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".bmp", ".tiff"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const METADATA_FILE = "memes.json";
const PREVIEW_PREFIX = "preview-";

export type Meme = {
  file: string;
  path: string;
  // Imagen que se muestra en la grilla: el propio archivo o, para videos, una miniatura.
  thumbnail: string;
  isVideo: boolean;
  title: string;
  keywords: string[];
};

type Metadata = Record<string, { title?: string; keywords?: string[] }>;

export function memesFolder(): string {
  return getPreferenceValues<{ memesFolder: string }>().memesFolder;
}

function defaultTitle(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[-_.]+/g, " ")
    .trim();
}

// Sin tildes, para que "cafe" encuentre "café".
function unaccent(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function searchKeywords(meme: Meme): string[] {
  const terms = [...meme.keywords, meme.file];
  return [...new Set([...terms, ...[meme.title, ...terms].map(unaccent)])];
}

// macOS puede devolver los nombres con tildes descompuestas (NFD); el JSON se indexa siempre en NFC.
function metadataKey(file: string): string {
  return file.normalize("NFC");
}

async function readMetadata(folder: string): Promise<Metadata> {
  try {
    const metadata: Metadata = JSON.parse(await readFile(path.join(folder, METADATA_FILE), "utf8"));
    return Object.fromEntries(Object.entries(metadata).map(([file, data]) => [metadataKey(file), data]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`No se pudo leer ${METADATA_FILE}: ${(error as Error).message}`);
  }
}

export async function loadMemes(): Promise<Meme[]> {
  const folder = memesFolder();
  const [entries, metadata] = await Promise.all([readdir(folder, { withFileTypes: true }), readMetadata(folder)]);

  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, extension: path.extname(entry.name).toLowerCase() }))
    .filter(({ extension }) => IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension));

  // Los memes sin etiquetar se buscan por el texto que tienen escrito. De a uno, para no lanzar cientos de procesos.
  const files = [];
  for (const file of names) {
    const filePath = path.join(folder, file.name);
    const data = metadata[metadataKey(file.name)];
    const needsText = !data && IMAGE_EXTENSIONS.has(file.extension);
    files.push({ ...file, filePath, data, text: needsText ? await cachedText(filePath) : [] });
  }

  const memes = await Promise.all(
    files.map(async ({ name, extension, filePath, data, text }) => {
      const isVideo = VIDEO_EXTENSIONS.has(extension);
      return {
        file: name,
        path: filePath,
        thumbnail: isVideo ? await videoThumbnail(filePath) : filePath,
        isVideo,
        title: data?.title || defaultTitle(name),
        keywords: data?.keywords ?? keywordsFromText(text),
      };
    }),
  );
  return memes.sort((a, b) => a.title.localeCompare(b.title, "es"));
}

async function renderer(): Promise<string> {
  const binary = path.join(environment.assetsPath, "memeame-render");
  await chmod(binary, 0o755);
  return binary;
}

async function run(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(await renderer(), args);
    return stdout.trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error as Error).message);
  }
}

// Ruta de caché para algo derivado de `file`; cambia si el archivo se modifica.
async function cachePath(kind: string, file: string, extension: string): Promise<string> {
  const folder = path.join(environment.supportPath, kind);
  await mkdir(folder, { recursive: true });
  const { mtimeMs } = await stat(file);
  const name = createHash("sha1").update(`${file}:${mtimeMs}`).digest("hex");
  return path.join(folder, `${name}.${extension}`);
}

async function videoThumbnail(video: string): Promise<string> {
  const thumbnail = await cachePath("thumbnails", video, "jpg");
  try {
    await stat(thumbnail);
  } catch {
    await run(["thumbnail", video, thumbnail]);
  }
  return thumbnail;
}

// Renglones de texto que aparecen escritos en la imagen.
export async function recognizeText(image: string): Promise<string[]> {
  const output = await run(["ocr", image]);
  return output ? output.split("\n") : [];
}

async function cachedText(image: string): Promise<string[]> {
  try {
    const cache = await cachePath("text", image, "json");
    try {
      return JSON.parse(await readFile(cache, "utf8"));
    } catch {
      const text = await recognizeText(image);
      await writeFile(cache, JSON.stringify(text));
      return text;
    }
  } catch {
    return [];
  }
}

const WATERMARK = /\.(com|net|es|org)\b|memegenerator|tiktok|@/i;

export function keywordsFromText(lines: string[]): string[] {
  const keywords = lines
    .filter((line) => !WATERMARK.test(line))
    .map((line) =>
      line
        .toLocaleLowerCase("es")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.replace(/[^\p{L}]/gu, "").length >= 3);
  return [...new Set(keywords)].slice(0, 8);
}

export function titleFromText(lines: string[]): string {
  const title = keywordsFromText(lines).slice(0, 2).join(" ");
  return title.charAt(0).toLocaleUpperCase("es") + title.slice(1);
}

export type ClipboardImage = { path: string; isVideo: boolean };

export async function readClipboardImage(): Promise<ClipboardImage> {
  await mkdir(environment.supportPath, { recursive: true });
  const file = await run(["clipboard", path.join(environment.supportPath, "clipboard.png")]);
  const extension = path.extname(file).toLowerCase();
  const isVideo = VIDEO_EXTENSIONS.has(extension);
  if (!isVideo && !IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`El archivo copiado no es una imagen ni un video: ${path.basename(file)}`);
  }
  return { path: file, isVideo };
}

// Copia `source` a la carpeta de memes con un nombre derivado del título y guarda sus palabras clave.
export async function addMeme(source: string, title: string, keywords: string[]): Promise<string> {
  const folder = memesFolder();
  const extension = path.extname(source).toLowerCase();
  const base = title.replace(/[/:\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

  const taken = new Set((await readdir(folder)).map((file) => metadataKey(file).toLowerCase()));
  let file = `${base}${extension}`;
  for (let copy = 2; taken.has(metadataKey(file).toLowerCase()); copy++) {
    file = `${base} ${copy}${extension}`;
  }

  await copyFile(source, path.join(folder, file));
  await saveMeme(file, title, keywords);
  return file;
}

export async function saveMeme(file: string, title: string, keywords: string[]): Promise<void> {
  const folder = memesFolder();
  const metadata = await readMetadata(folder);
  metadata[metadataKey(file)] = { title, keywords };
  await writeFile(path.join(folder, METADATA_FILE), JSON.stringify(metadata, null, 2) + "\n");
}

// `name` es el nombre del archivo de salida, sin extensión.
export async function renderMeme(meme: Meme, top: string, bottom: string, name = "meme"): Promise<string> {
  await mkdir(environment.supportPath, { recursive: true });
  const extension = path.extname(meme.file).toLowerCase() === ".png" ? "png" : "jpg";
  const output = path.join(environment.supportPath, `${name}.${extension}`);
  await run([meme.path, output, top, bottom]);
  return output;
}

// Cada vista previa va a un archivo distinto porque Raycast cachea las imágenes por ruta.
let previewCount = 0;

export function renderPreview(meme: Meme, top: string, bottom: string): Promise<string> {
  return renderMeme(meme, top, bottom, `${PREVIEW_PREFIX}${Date.now()}-${previewCount++}`);
}

export async function removePreview(preview: string): Promise<void> {
  await rm(preview, { force: true });
}

export async function clearPreviews(): Promise<void> {
  const files = await readdir(environment.supportPath).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file.startsWith(PREVIEW_PREFIX))
      .map((file) => removePreview(path.join(environment.supportPath, file))),
  );
}
