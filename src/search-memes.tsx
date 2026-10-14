import {
  Action,
  ActionPanel,
  Clipboard,
  Form,
  Grid,
  Icon,
  Toast,
  openExtensionPreferences,
  popToRoot,
  showHUD,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useFrecencySorting, usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { CaptionEditor } from "./caption-editor";
import { Meme, clearPreviews, loadMemes, memesFolder, saveMeme, searchKeywords } from "./lib";
import { WebSearch } from "./search-web";

export default function SearchMemes() {
  const { data: memes = [], isLoading, error, revalidate } = usePromise(loadMemes);
  const { data: sorted, visitItem } = useFrecencySorting(memes, { key: (meme) => meme.file });
  const [searchText, setSearchText] = useState("");
  const query = searchText.trim();

  const searchWeb = (
    <Action.Push
      title="Buscar en Internet"
      icon={Icon.Globe}
      shortcut={{ modifiers: ["cmd"], key: "i" }}
      target={<WebSearch initialQuery={query} />}
    />
  );

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
    <Grid
      columns={4}
      fit={Grid.Fit.Contain}
      isLoading={isLoading}
      filtering
      searchBarPlaceholder="Buscar meme..."
      onSearchTextChange={setSearchText}
    >
      {error || memes.length === 0 ? (
        <Grid.EmptyView
          icon={error ? Icon.Warning : Icon.Image}
          title={error ? "No se pudo leer la carpeta de memes" : "No hay memes"}
          description={error ? error.message : `Agregá imágenes en ${memesFolder()}`}
          actions={
            <ActionPanel>
              <Action title="Abrir Preferencias" icon={Icon.Gear} onAction={openExtensionPreferences} />
              {searchWeb}
            </ActionPanel>
          }
        />
      ) : (
        <Grid.EmptyView
          icon={Icon.Globe}
          title={`No tenés memes para "${query}"`}
          description="Enter para buscar en internet"
          actions={<ActionPanel>{searchWeb}</ActionPanel>}
        />
      )}
      <Grid.Section title="Mis memes">
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
                {searchWeb}
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
      {query && (
        <Grid.Section title="Internet">
          {/* La búsqueda va como palabra clave para que el filtro de la grilla nunca oculte este ítem. */}
          <Grid.Item
            content={Icon.Globe}
            title={`Buscar "${query}" en internet`}
            keywords={[query]}
            actions={<ActionPanel>{searchWeb}</ActionPanel>}
          />
        </Grid.Section>
      )}
    </Grid>
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
