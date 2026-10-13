# Memeame

Extensión de [Raycast](https://www.raycast.com) para Mac: buscá un meme en tu carpeta, agregale texto viendo cómo queda mientras escribís, y copialo al portapapeles para pegarlo donde quieras.

## Qué hace

- **Buscar Meme**: grilla con todos los memes de una carpeta, con búsqueda por título y palabras clave (con o sin tildes). Los que más usás aparecen primero.
- **Texto con vista previa en vivo**: texto arriba y abajo en estilo meme clásico (Impact blanco con borde negro).
- **Videos**: los `.mp4`, `.mov` y `.m4v` aparecen con miniatura y se copian tal cual.
- **Guardar Meme del Portapapeles**: guarda la imagen que acabás de copiar en la carpeta, con título y palabras clave sugeridos a partir del texto que tiene escrito.
- **Etiquetado automático**: los memes sin palabras clave se pueden buscar por el texto que aparece en la imagen.

## Instalación

Requisitos: macOS, Raycast, Node.js 20 o superior y las herramientas de línea de comandos de Xcode (`xcode-select --install`), que traen el compilador de Swift.

```sh
git clone git@github.com:nicogaldamez/Memeame.git
cd Memeame
npm install
npm run dev
```

`npm run dev` compila el generador de imágenes e importa la extensión en Raycast. Una vez importada podés cortar el comando con `Ctrl C`: la extensión queda instalada. Volvé a correrlo cuando cambies el código.

La primera vez que abras **Buscar Meme**, Raycast te pide la carpeta donde están tus memes.

Para lanzarlo con un atajo de teclado: Raycast Settings → Extensions → Memeame → Record Hotkey sobre cada comando.

## Uso

### Buscar Meme

| Atajo | Acción |
| --- | --- |
| `Enter` | Agregar texto (en un video: copiarlo) |
| `⌘ Enter` | Copiar sin texto (en un video: pegarlo en la app activa) |
| `⌘ E` | Editar título y palabras clave |
| `⌘ ⇧ F` | Mostrar en Finder |
| `⌘ R` | Recargar la carpeta |

### Agregar texto

El texto se escribe en la barra de búsqueda con el formato `texto de arriba / texto de abajo`. Sin barra, todo va arriba; para poner solo texto abajo, empezá con `/`.

| Atajo | Acción |
| --- | --- |
| `Enter` | Copiar el meme |
| `⌘ Enter` | Pegarlo en la app activa |
| `⌘ U` | Alternar entre todo en mayúsculas y respetar lo escrito |

### Guardar Meme del Portapapeles

Copiá una imagen, abrí el comando, revisá el título y las palabras clave sugeridas y guardá con `⌘ Enter`. El título se usa como nombre del archivo.

Para que un GIF o un video conserven la animación, copiá el archivo desde Finder: una imagen copiada desde el navegador llega como imagen fija.

## Palabras clave

Se guardan en `memes.json`, dentro de la misma carpeta de memes, así viajan con las imágenes:

```json
{
  "he dicho.png": {
    "title": "He dicho, caso cerrado",
    "keywords": ["he dicho", "caso cerrado", "jueza", "martillo"]
  }
}
```

Un meme que no figura en ese archivo usa el nombre del archivo como título y el texto reconocido en la imagen como palabras clave, hasta que lo edites con `⌘ E`.

## Limitaciones

- El texto va solo arriba y abajo, en posiciones fijas.
- La barra `/` separa arriba de abajo, así que no se puede usar dentro del texto.
- Un GIF con texto sale como imagen fija (el primer cuadro).
- A los videos no se les puede agregar texto.
- El reconocimiento de texto se equivoca a veces; conviene revisar las sugerencias al guardar.

## Estructura

- `src/search-memes.tsx`: comando de búsqueda, editor de texto y edición de palabras clave.
- `src/save-meme.tsx`: comando para guardar desde el portapapeles.
- `src/lib.ts`: lectura de la carpeta y de `memes.json`, cachés y llamadas al generador.
- `swift/render.swift`: binario que dibuja el texto sobre la imagen, saca miniaturas de videos, lee el portapapeles y reconoce texto. Se compila a `assets/memeame-render` con `npm run renderer`.
