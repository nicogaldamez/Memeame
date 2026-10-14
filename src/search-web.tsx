import {
  Action,
  ActionPanel,
  Clipboard,
  Grid,
  Icon,
  Toast,
  popToRoot,
  showHUD,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { CaptionEditor } from "./caption-editor";
import { Meme, clearPreviews, keywordsFromText, recognizeText, titleFromText } from "./lib";
import { SaveMemeForm } from "./save-form";
import { WebImage, clearOldDownloads, downloadImage, popularTemplates, searchImages } from "./web";

export default function SearchWeb() {
  return <WebSearch />;
}

export function WebSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const { push } = useNavigation();
  const [searchText, setSearchText] = useState(initialQuery);
  const query = searchText.trim();

  // Sin búsqueda se muestran las plantillas clásicas; al escribir se busca en internet.
  const {
    data: images = [],
    isLoading,
    error,
  } = useCachedPromise((query: string) => (query ? searchImages(query) : popularTemplates()), [query], {
    keepPreviousData: true,
  });

  useEffect(() => {
    clearPreviews();
    clearOldDownloads();
  }, []);

  async function download(image: WebImage): Promise<Meme | undefined> {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Descargando imagen..." });
    try {
      const meme = await downloadImage(image);
      await toast.hide();
      return meme;
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "No se pudo descargar la imagen";
      toast.message = String(error);
    }
  }

  async function addCaption(image: WebImage) {
    const meme = await download(image);
    if (meme) push(<CaptionEditor meme={meme} />);
  }

  async function copy(image: WebImage) {
    const meme = await download(image);
    if (!meme) return;
    await Clipboard.copy({ file: meme.path });
    await showHUD("Imagen copiada");
    await popToRoot({ clearSearchBar: true });
  }

  async function save(image: WebImage) {
    const meme = await download(image);
    if (!meme) return;
    const text = await recognizeText(meme.path).catch(() => []);
    // Los títulos de los resultados web suelen ser ruido; la búsqueda describe mejor la imagen.
    const fallbackTitle = query || image.title;
    push(
      <SaveMemeForm
        source={meme.path}
        description={image.title}
        title={titleFromText(text) || fallbackTitle}
        keywords={[...new Set([...keywordsFromText(text), fallbackTitle.toLocaleLowerCase("es")])]}
      />,
    );
  }

  return (
    <Grid
      columns={4}
      fit={Grid.Fit.Contain}
      isLoading={isLoading}
      throttle
      searchBarPlaceholder="Buscar imágenes en internet..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      <Grid.EmptyView
        icon={error ? Icon.Warning : Icon.MagnifyingGlass}
        title={error ? "No se pudo buscar" : "Sin resultados"}
        description={error?.message}
      />
      <Grid.Section title={query ? "Resultados" : "Plantillas populares"}>
        {images.map((image) => (
          <Grid.Item
            key={image.id}
            content={{ source: image.thumbnail }}
            title={image.title}
            actions={
              <ActionPanel>
                <Action title="Agregar Texto" icon={Icon.Text} onAction={() => addCaption(image)} />
                <Action title="Copiar Sin Texto" icon={Icon.Clipboard} onAction={() => copy(image)} />
                <Action
                  title="Guardar en Mis Memes"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "s" }}
                  onAction={() => save(image)}
                />
                {image.page && (
                  <Action.OpenInBrowser
                    title="Abrir Página de Origen"
                    url={image.page}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                  />
                )}
              </ActionPanel>
            }
          />
        ))}
      </Grid.Section>
    </Grid>
  );
}
