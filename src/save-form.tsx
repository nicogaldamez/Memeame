import { Action, ActionPanel, Form, Icon, Toast, popToRoot, showHUD, showToast } from "@raycast/api";
import { addMeme } from "./lib";

type Props = {
  // Archivo que se va a copiar a la carpeta de memes.
  source: string;
  description: string;
  title: string;
  keywords: string[];
};

export function SaveMemeForm({ source, description, title, keywords }: Props) {
  async function save(values: { title: string; keywords: string }) {
    const title = values.title.trim();
    if (!title) {
      await showToast({ style: Toast.Style.Failure, title: "Falta el título" });
      return;
    }
    const keywords = values.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    try {
      await addMeme(source, title, keywords);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "No se pudo guardar el meme", message: String(error) });
      return;
    }
    await showHUD("Meme guardado");
    await popToRoot({ clearSearchBar: true });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Guardar Meme" icon={Icon.Plus} onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.Description title="Archivo" text={description} />
      <Form.TextField
        id="title"
        title="Título"
        defaultValue={title}
        info="También se usa como nombre del archivo"
        autoFocus
      />
      <Form.TextArea
        id="keywords"
        title="Palabras clave"
        info="Separadas por coma"
        defaultValue={keywords.join(", ")}
      />
    </Form>
  );
}
