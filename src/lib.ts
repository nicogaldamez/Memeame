import { environment, getPreferenceValues } from "@raycast/api";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({ name: entry.name, extension: path.extname(entry.name).toLowerCase() }))
    .filter(({ extension }) => IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension));

  const memes = await Promise.all(
    files.map(async ({ name, extension }) => {
      const data = metadata[metadataKey(name)];
      const filePath = path.join(folder, name);
      const isVideo = VIDEO_EXTENSIONS.has(extension);
      return {
        file: name,
        path: filePath,
        thumbnail: isVideo ? await videoThumbnail(filePath) : filePath,
        isVideo,
        title: data?.title || defaultTitle(name),
        keywords: data?.keywords ?? [],
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

async function run(args: string[]): Promise<void> {
  try {
    await execFileAsync(await renderer(), args);
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error as Error).message);
  }
}

async function videoThumbnail(video: string): Promise<string> {
  const folder = path.join(environment.supportPath, "thumbnails");
  const { mtimeMs } = await stat(video);
  const name = createHash("sha1").update(`${video}:${mtimeMs}`).digest("hex");
  const thumbnail = path.join(folder, `${name}.jpg`);
  try {
    await stat(thumbnail);
  } catch {
    await mkdir(folder, { recursive: true });
    await run(["thumbnail", video, thumbnail]);
  }
  return thumbnail;
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
