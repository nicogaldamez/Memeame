import { Detail } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import path from "node:path";
import { keywordsFromText, readClipboardImage, recognizeText, titleFromText } from "./lib";
import { SaveMemeForm } from "./save-form";

async function loadClipboard() {
  const image = await readClipboardImage();
  const text = image.isVideo ? [] : await recognizeText(image.path).catch(() => []);
  return { image, title: titleFromText(text), keywords: keywordsFromText(text) };
}

export default function SaveMeme() {
  const { data, isLoading, error } = usePromise(loadClipboard, [], { onError: () => {} });

  if (error) {
    return <Detail markdown={`# No se pudo leer el portapapeles\n\n${error.message}`} />;
  }
  if (!data) {
    return <Detail isLoading={isLoading} markdown="" />;
  }

  const file = path.basename(data.image.path);
  return (
    <SaveMemeForm
      source={data.image.path}
      description={file === "clipboard.png" ? "Imagen del portapapeles" : file}
      title={data.title}
      keywords={data.keywords}
    />
  );
}
