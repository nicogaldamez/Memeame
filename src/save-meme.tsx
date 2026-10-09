import { Action, ActionPanel, Detail, Form, Icon, Toast, popToRoot, showHUD, showToast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import path from "node:path";
import { addMeme, keywordsFromText, readClipboardImage, recognizeText, titleFromText } from "./lib";

async function loadClipboard() {
  const image = await readClipboardImage();
  const text = image.isVideo ? [] : await recognizeText(image.path).catch(() => []);
  return { image, title: titleFromText(text), keywords: keywordsFromText(text).join(", ") };
}

export default function SaveMeme() {
  const { data, isLoading, error } = usePromise(loadClipboard, [], { onError: () => {} });

  async function save(values: { title: string; keywords: string }) {
    const title = values.title.trim();
    if (!data) return;
    if (!title) {
      await showToast({ style: Toast.Style.Failure, title: "Falta el título" });
      return;
    }
    const keywords = values.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    try {
      await addMeme(data.image.path, title, keywords);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "No se pudo guardar el meme", message: String(error) });
      return;
    }
    await showHUD("Meme guardado");
    await popToRoot({ clearSearchBar: true });
  }

  if (error) {
    return <Detail markdown={`# No se pudo leer el portapapeles\n\n${error.message}`} />;
  }
  if (!data) {
    return <Detail isLoading={isLoading} markdown="" />;
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Guardar Meme" icon={Icon.Plus} onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.Description
        title={data.image.isVideo ? "Video" : "Imagen"}
        text={
          path.basename(data.image.path) === "clipboard.png" ? "Imagen del portapapeles" : path.basename(data.image.path)
        }
      />
      <Form.TextField
        id="title"
        title="Título"
        defaultValue={data.title}
        info="También se usa como nombre del archivo"
        autoFocus
      />
      <Form.TextArea id="keywords" title="Palabras clave" info="Separadas por coma" defaultValue={data.keywords} />
    </Form>
  );
}
