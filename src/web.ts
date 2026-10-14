import { environment } from "@raycast/api";
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Meme } from "./lib";

export type WebImage = {
  id: string;
  title: string;
  image: string;
  thumbnail: string;
  // Página donde está publicada la imagen.
  page?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
const DOWNLOADS_MAX_AGE = 24 * 60 * 60 * 1000;

function downloadsFolder(): string {
  return path.join(environment.supportPath, "web");
}

// Las 100 plantillas más usadas de Imgflip.
export async function popularTemplates(): Promise<WebImage[]> {
  const response = await fetch("https://api.imgflip.com/get_memes");
  const body = (await response.json()) as {
    success: boolean;
    data?: { memes: { id: string; name: string; url: string }[] };
  };
  if (!response.ok || !body.success || !body.data) throw new Error("Imgflip no respondió");
  return body.data.memes.map((meme) => ({
    id: `imgflip-${meme.id}`,
    title: meme.name,
    image: meme.url,
    thumbnail: meme.url,
    page: `https://imgflip.com/memetemplate/${meme.id}`,
  }));
}

// DuckDuckGo no tiene API oficial de imágenes: se usa la misma que usa su web, que exige un token por búsqueda.
export async function searchImages(query: string): Promise<WebImage[]> {
  const headers = { "User-Agent": USER_AGENT, Referer: "https://duckduckgo.com/" };
  const encoded = encodeURIComponent(query);

  const page = await fetch(`https://duckduckgo.com/?q=${encoded}&iax=images&ia=images`, { headers });
  const token = (await page.text()).match(/vqd=["']?([\d-]+)/)?.[1];
  if (!token) throw new Error("DuckDuckGo no devolvió el token de búsqueda; puede haber cambiado su web");

  const response = await fetch(`https://duckduckgo.com/i.js?l=ar-es&o=json&q=${encoded}&vqd=${token}&f=,,,&p=1`, {
    headers,
  });
  if (!response.ok) throw new Error(`DuckDuckGo respondió ${response.status}`);
  const body = (await response.json()) as {
    results: { title: string; image: string; thumbnail: string; url: string }[];
  };
  return body.results.map((result, index) => ({
    id: `ddg-${index}-${result.image}`,
    title: result.title,
    image: result.image,
    thumbnail: result.thumbnail,
    page: result.url,
  }));
}

async function fetchImage(url: string): Promise<{ data: Buffer; extension: string }> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!response.ok || !EXTENSIONS[type]) throw new Error(`No se pudo descargar la imagen (${response.status} ${type})`);
  return { data: Buffer.from(await response.arrayBuffer()), extension: EXTENSIONS[type] };
}

// Descarga la imagen a una carpeta temporal y la devuelve como un meme editable.
export async function downloadImage(image: WebImage): Promise<Meme> {
  // Muchos sitios bloquean la descarga directa; la miniatura del buscador siempre está disponible.
  const { data, extension } = await fetchImage(image.image).catch(() => fetchImage(image.thumbnail));

  await mkdir(downloadsFolder(), { recursive: true });
  const file = `${createHash("sha1").update(image.image).digest("hex")}.${extension}`;
  const filePath = path.join(downloadsFolder(), file);
  await writeFile(filePath, data);
  return { file, path: filePath, thumbnail: filePath, isVideo: false, title: image.title, keywords: [] };
}

// No se borran al instante porque el portapapeles puede seguir apuntando a una descarga reciente.
export async function clearOldDownloads(): Promise<void> {
  const files = await readdir(downloadsFolder()).catch(() => []);
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(downloadsFolder(), file);
      const { mtimeMs } = await stat(filePath);
      if (Date.now() - mtimeMs > DOWNLOADS_MAX_AGE) await rm(filePath, { force: true });
    }),
  );
}
