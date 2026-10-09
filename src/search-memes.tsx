import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Grid,
  Icon,
  List,
  Toast,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCachedState, useFrecencySorting, usePromise } from "@raycast/utils";
import { pathToFileURL } from "node:url";
import { useEffect, useRef, useState } from "react";
import {
  Meme,
  clearPreviews,
  loadMemes,
  memesFolder,
  removePreview,
  renderMeme,
  renderPreview,
  saveMeme,
  searchKeywords,
} from "./lib";

export default function SearchMemes() {
  const { data: memes = [], isLoading, error, revalidate } = usePromise(loadMemes);
  const { data: sorted, visitItem } = useFrecencySorting(memes, { key: (meme) => meme.file });

  useEffect(() => {
    clearPreviews();
  }, []);

  async function pasteOriginal(meme: Meme) {
    visitItem(meme);
    await Clipboard.paste({ file: meme.path });
    await popToRoot({ clearSearchBar: true });
  }

  async function copyOriginal(meme: Meme) {
    await Clipboard.copy({ file: meme.path });
    visitItem(meme);
    await showHUD(meme.isVideo ? "Video copiado" : "Meme copiado");
    await popToRoot({ clearSearchBar: true });
  }

  return (
    <Grid columns={4} fit={Grid.Fit.Contain} isLoading={isLoading} searchBarPlaceholder="Buscar meme...">
      <Grid.EmptyView
        icon={error ? Icon.Warning : Icon.Image}
        title={error ? "No se pudo leer la carpeta de memes" : "No hay memes"}
        description={error ? error.message : `Agregá imágenes en ${memesFolder()}`}
        actions={
          <ActionPanel>
            <Action title="Abrir Preferencias" icon={Icon.Gear} onAction={openExtensionPreferences} />
          </ActionPanel>
        }
      />
      {sorted.map((meme) => (
        <Grid.Item
          key={meme.file}
          content={{ source: meme.thumbnail }}
          title={meme.title}
          subtitle={meme.isVideo ? "Video" : undefined}
          keywords={searchKeywords(meme)}
          actions={
            <ActionPanel>
              {!meme.isVideo && (
                <Action.Push
                  title="Agregar Texto"
                  icon={Icon.Text}
                  target={<CaptionEditor meme={meme} onUse={() => visitItem(meme)} />}
                />
              )}
              <Action
                title={meme.isVideo ? "Copiar Video" : "Copiar Sin Texto"}
                icon={Icon.Clipboard}
                onAction={() => copyOriginal(meme)}
              />
              {meme.isVideo && (
                <Action title="Pegar en la App Activa" icon={Icon.ArrowRight} onAction={() => pasteOriginal(meme)} />
              )}
              <Action.Push
                title="Editar Palabras Clave"
                icon={Icon.Tag}
                shortcut={{ modifiers: ["cmd"], key: "e" }}
                target={<KeywordsForm meme={meme} onSave={revalidate} />}
              />
              <Action.ShowInFinder path={meme.path} shortcut={{ modifiers: ["cmd", "shift"], key: "f" }} />
              <Action
                title="Recargar"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </Grid>
  );
}

// "arriba / abajo": lo que está antes de la primera barra va arriba, el resto abajo.
function splitCaption(text: string, uppercase: boolean): [string, string] {
  const separator = text.indexOf("/");
  const parts = separator === -1 ? [text, ""] : [text.slice(0, separator), text.slice(separator + 1)];
  const [top, bottom] = parts.map((part) => (uppercase ? part.trim().toLocaleUpperCase("es") : part.trim()));
  return [top, bottom];
}

// La barra de búsqueda hace de campo de texto: es la única forma de tener vista previa en vivo en Raycast.
function CaptionEditor({ meme, onUse }: { meme: Meme; onUse: () => void }) {
  const [text, setText] = useState("");
  const [uppercase, setUppercase] = useCachedState("uppercase", true);
  const [preview, setPreview] = useState<string>();
  const [isRendering, setIsRendering] = useState(true);
  const latestRender = useRef(0);
  const [top, bottom] = splitCaption(text, uppercase);

  useEffect(() => {
    const id = ++latestRender.current;
    setIsRendering(true);
    renderPreview(meme, top, bottom)
      .then((output) => {
        if (id !== latestRender.current) return removePreview(output);
        setPreview((previous) => {
          if (previous) removePreview(previous);
          return output;
        });
        setIsRendering(false);
      })
      .catch((error) => {
        if (id !== latestRender.current) return;
        setIsRendering(false);
        showToast({ style: Toast.Style.Failure, title: "No se pudo generar el meme", message: String(error) });
      });
  }, [meme.path, top, bottom]);

  async function render(): Promise<string | undefined> {
    try {
      return await renderMeme(meme, top, bottom);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "No se pudo generar el meme", message: String(error) });
    }
  }

  async function copy() {
    const output = await render();
    if (!output) return;
    await Clipboard.copy({ file: output });
    onUse();
    await showHUD("Meme copiado");
    await popToRoot({ clearSearchBar: true });
  }

  async function paste() {
    const output = await render();
    if (!output) return;
    onUse();
    await Clipboard.paste({ file: output });
    await popToRoot({ clearSearchBar: true });
  }

  const detail = <List.Item.Detail markdown={preview ? `![Meme](${pathToFileURL(preview).href})` : ""} />;
  const actions = (
    <ActionPanel>
      <Action title="Copiar Meme" icon={Icon.Clipboard} onAction={copy} />
      <Action title="Pegar en la App Activa" icon={Icon.ArrowRight} onAction={paste} />
      <Action
        title={uppercase ? "Respetar Mayúsculas y Minúsculas" : "Pasar Todo a Mayúsculas"}
        icon={Icon.Text}
        shortcut={{ modifiers: ["cmd"], key: "u" }}
        onAction={() => setUppercase(!uppercase)}
      />
    </ActionPanel>
  );

  return (
    <List
      isShowingDetail
      isLoading={isRendering}
      navigationTitle={meme.title}
      searchBarPlaceholder="Texto de arriba / texto de abajo"
      onSearchTextChange={setText}
    >
      <List.Item
        id="top"
        icon={Icon.ArrowUp}
        title={top || "Sin texto arriba"}
        detail={detail}
        actions={actions}
      />
      <List.Item
        id="bottom"
        icon={Icon.ArrowDown}
        title={bottom || "Sin texto abajo"}
        detail={detail}
        actions={actions}
      />
    </List>
  );
}

function KeywordsForm({ meme, onSave }: { meme: Meme; onSave: () => void }) {
  const { pop } = useNavigation();

  async function save(values: { title: string; keywords: string }) {
    const keywords = values.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    try {
      await saveMeme(meme.file, values.title.trim(), keywords);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "No se pudo guardar", message: String(error) });
      return;
    }
    onSave();
    pop();
  }

  return (
    <Form
      navigationTitle={meme.file}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Guardar" icon={Icon.Check} onSubmit={save} />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Título" defaultValue={meme.title} />
      <Form.TextArea
        id="keywords"
        title="Palabras clave"
        info="Separadas por coma"
        defaultValue={meme.keywords.join(", ")}
      />
    </Form>
  );
}
