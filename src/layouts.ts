import { TextBox } from "./lib";

export type Layout = {
  id: string;
  title: string;
  placeholder: string;
  // Dónde va cada uno de los textos separados por "/".
  boxes: (texts: string[]) => TextBox[];
};

// `count` filas iguales dentro de la franja horizontal que va de `x` a `x + width`.
function rows(texts: string[], x: number, width: number, align: (index: number) => TextBox["align"]): TextBox[] {
  const height = 1 / texts.length;
  return texts.map((text, index) => ({ text, x, y: index * height, width, height, align: align(index) }));
}

export const LAYOUTS: Layout[] = [
  {
    id: "top-bottom",
    title: "Arriba y abajo",
    placeholder: "Texto de arriba / texto de abajo",
    boxes: (texts) => {
      // Uno o dos textos van pegados a los bordes, como en el meme clásico; con más, se reparten en filas.
      if (texts.length <= 2) {
        const band = 0.34;
        return texts.map((text, index) => ({
          text,
          x: 0,
          y: index === 0 ? 0 : 1 - band,
          width: 1,
          height: band,
          align: index === 0 ? "top" : "bottom",
        }));
      }
      return rows(texts, 0, 1, (index) => (index === 0 ? "top" : index === texts.length - 1 ? "bottom" : "center"));
    },
  },
  {
    id: "right",
    title: "Filas a la derecha",
    placeholder: "Texto del primer panel / texto del segundo / ...",
    boxes: (texts) => rows(texts, 0.5, 0.5, () => "center"),
  },
  {
    id: "left",
    title: "Filas a la izquierda",
    placeholder: "Texto del primer panel / texto del segundo / ...",
    boxes: (texts) => rows(texts, 0, 0.5, () => "center"),
  },
  {
    id: "columns",
    title: "Columnas",
    placeholder: "Texto de la izquierda / texto de la derecha",
    boxes: (texts) => {
      const width = 1 / texts.length;
      return texts.map((text, index) => ({ text, x: index * width, y: 0, width, height: 1, align: "top" }));
    },
  },
  {
    id: "center",
    title: "Centro",
    placeholder: "Texto en el centro",
    boxes: (texts) => rows(texts, 0, 1, () => "center"),
  },
];
