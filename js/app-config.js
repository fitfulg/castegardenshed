export const APP_VERSION = "1.0.3";

export const STORAGE_KEY = "almacen_materiales_v5";
export const LEGACY_STORAGE_KEYS = ["almacen_materiales_v4", "almacen_materiales_v3"];

export const REMOTE_TABLE = "materiales";
export const REMOTE_OPTIONAL_FIELDS = ["seccion", "cantidad_comprobada"];

export const SHELF_LABELS = {
  A: "A - EPI",
  B: "B - Herramientas",
  C: "C - Desbroce, plantación y poda",
  D: "D - Solenoides, programadores, grifos y Techline",
  E: "E - Difusores, boquillas, aspersores y electroválvulas",
  F: "F - Tapones, collarines, enlaces, Té y codos",
  G: "G - Almacén de stock",
  A2: "Almacén 2 - Estantería A",
  B2: "Almacén 2 - Estantería B",
  C2: "Almacén 2 - Estantería C"
};

export const SHELF_SECTIONS = {
  C: ["Desbroce", "Plantación", "Poda"],
  D: ["Solenoides", "Programadores", "Grifos", "Techline 16\"", "Techline 17\""],
  E: ["Difusores", "Boquillas", "Aspersores", "Bobinas", "Reducciones", "Electroválvulas"],
  F: ["Tapones", "Collarines", "Enlaces", "Té", "Codos"]
};
