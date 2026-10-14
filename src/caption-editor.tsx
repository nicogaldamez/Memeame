import { Action, ActionPanel, Clipboard, Icon, List, Toast, popToRoot, showHUD, showToast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { pathToFileURL } from "node:url";
import { useEffect, useRef, useState } from "react";
import { LAYOUTS } from "./layouts";
import { Meme, removePreview, renderMeme, renderPreview } from "./lib";

// Cada "/" separa un texto del siguiente: "arriba / abajo".
function splitCaption(text: string, uppercase: boolean): string[] {
  return text.split("/").map((part) => (uppercase ? part.trim().toLocaleUpperCase("es") : part.trim()));
}

// La barra de búsqueda hace de campo de texto: es la única forma de tener vista previa en vivo en Raycast.
export function CaptionEditor({ meme, onUse }: { meme: Meme; onUse?: () => void }) {
  const [text, setText] = useState("");
  const [uppercase, setUppercase] = useCachedState("uppercase", true);
  // Cada meme recuerda su disposición: una plantilla de paneles la necesita siempre igual.
  const [layoutId, setLayoutId] = useCachedState(`layout:${meme.file}`, LAYOUTS[0].id);
  const [preview, setPreview] = useState<string>();
  const [isRendering, setIsRendering] = useState(true);
  const latestRender = useRef(0);

  const layout = LAYOUTS.find((layout) => layout.id === layoutId) ?? LAYOUTS[0];
  const texts = splitCaption(text, uppercase);
  const boxes = layout.boxes(texts);
  const boxesKey = JSON.stringify(boxes);

  useEffect(() => {
    const id = ++latestRender.current;
    setIsRendering(true);
    renderPreview(meme, boxes)
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
  }, [meme.path, boxesKey]);

  async function render(): Promise<string | undefined> {
    try {
      return await renderMeme(meme, boxes);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "No se pudo generar el meme", message: String(error) });
    }
  }

  async function copy() {
    const output = await render();
    if (!output) return;
    await Clipboard.copy({ file: output });
    onUse?.();
    await showHUD("Meme copiado");
    await popToRoot({ clearSearchBar: true });
  }

  async function paste() {
    const output = await render();
    if (!output) return;
    onUse?.();
    await Clipboard.paste({ file: output });
    await popToRoot({ clearSearchBar: true });
  }

  const detail = <List.Item.Detail markdown={preview ? `![Meme](${pathToFileURL(preview).href})` : ""} />;
  const actions = (
    <ActionPanel>
      <Action title="Copiar Meme" icon={Icon.Clipboard} onAction={copy} />
      <Action title="Pegar en la App Activa" icon={Icon.ArrowRight} onAction={paste} />
      <ActionPanel.Submenu
        title="Cambiar Disposición del Texto"
        icon={Icon.AppWindowGrid2x2}
        shortcut={{ modifiers: ["cmd"], key: "l" }}
      >
        {LAYOUTS.map((option) => (
          <Action
            key={option.id}
            title={option.title}
            icon={option.id === layout.id ? Icon.CheckCircle : Icon.Circle}
            onAction={() => setLayoutId(option.id)}
          />
        ))}
      </ActionPanel.Submenu>
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
      searchBarPlaceholder={layout.placeholder}
      onSearchTextChange={setText}
    >
      <List.Section title={`${layout.title} · ⌘L para cambiar`}>
        {texts.map((text, index) => (
          <List.Item key={index} icon={Icon.Text} title={text || "Sin texto"} detail={detail} actions={actions} />
        ))}
      </List.Section>
    </List>
  );
}
