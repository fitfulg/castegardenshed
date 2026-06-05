import {
  REMOTE_OPTIONAL_FIELDS,
  SHELF_LABELS,
  SHELF_SECTIONS
} from "./app-config.js";

export function normalizeMaterial(raw) {
  const material = raw && typeof raw === "object" ? raw : {};
  const cantidad = normalizeQuantity(material.cantidad);
  const codigo = cleanValue(material.codigo);
  const estanteria = normalizeShelf(material.estanteria);
  const seccion = cleanValue(material.seccion) || inferSection({ ...material, estanteria });
  const hasExplicitCheckedQuantity = material.cantidad_comprobada === true;
  const estado = normalizeText(material.estado_stock || "verde");

  return {
    id: String(material.id || material.codigo || createId()),
    codigo,
    nombre: cleanValue(material.nombre) || "Sin nombre",
    tipo_material: cleanValue(material.tipo_material) || "Sin tipo",
    estanteria,
    seccion,
    cantidad,
    cantidad_comprobada: hasExplicitCheckedQuantity,
    unidad: cleanValue(material.unidad),
    ubicacion: cleanValue(material.ubicacion),
    estado_stock: ["pendiente", "verde", "amarillo", "rojo"].includes(estado) ? estado : "verde",
    pedido_hecho: Boolean(material.pedido_hecho),
    prestado_cantidad: Math.max(0, normalizeQuantity(material.prestado_cantidad) || 0),
    prestado_fijo: Boolean(material.prestado_fijo),
    prestado_fecha: cleanValue(material.prestado_fecha),
    observaciones: cleanValue(material.observaciones),
    ultima_actualizacion: cleanValue(material.ultima_actualizacion)
  };
}

export function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.materiales)) return data.materiales;
  return [];
}

export function cleanValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeQuantity(value) {
  const text = cleanValue(value);
  if (text === "") return null;

  const quantity = Number(text.replace(",", "."));
  return Number.isFinite(quantity) ? quantity : null;
}

export function normalizeText(value) {
  return cleanValue(value)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function normalizeShelf(value) {
  const shelf = cleanValue(value).toUpperCase();
  return SHELF_LABELS[shelf] ? shelf : "";
}

export function inferSection(material) {
  if (!material) return "";

  const shelf = normalizeShelf(material.estanteria);
  const sections = SHELF_SECTIONS[shelf] || [];
  if (!sections.length) return "";

  const text = normalizeText([
    material.seccion,
    material.ubicacion,
    material.nombre,
    material.tipo_material
  ].filter(Boolean).join(" "));

  const rules = {
    C: [
      ["Desbroce", ["desbroce", "hilo", "cabezal"]],
      ["Plantación", ["plantacion", "plantar", "jardi mixte"]],
      ["Poda", ["poda", "tijera", "felco", "serrucho"]]
    ],
    D: [
      ["Solenoides", ["solenoide"]],
      ["Programadores", ["programador", "program.", "rainbow", "tbos"]],
      ["Grifos", ["grifo"]],
      ["Techline 16\"", ["techline 16", "t 16", "16mm", "16 mm"]],
      ["Techline 17\"", ["techline 17", "t 17"]]
    ],
    E: [
      ["Difusores", ["difusor"]],
      ["Boquillas", ["boquilla", "tobera"]],
      ["Aspersores", ["aspersor"]],
      ["Bobinas", ["bobina"]],
      ["Reducciones", ["reduccion", "reducciones"]],
      ["Electroválvulas", ["electrovalvula", "electroval.", "valvula"]]
    ],
    F: [
      ["Tapones", ["tapon", "tapones"]],
      ["Collarines", ["collarin", "collarines"]],
      ["Enlaces", ["enlace", "enlaces", "racor"]],
      ["Té", [" te ", " tes ", " t "]],
      ["Codos", ["codo", "codos"]]
    ]
  };

  const match = (rules[shelf] || []).find(([, words]) => words.some((word) => text.includes(word)));
  return match?.[0] || "";
}

export function compareMaterials(a, b) {
  return (a.tipo_material || "").localeCompare(b.tipo_material || "", "es", { sensitivity: "base" })
    || (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
    || (a.codigo || "").localeCompare(b.codigo || "", "es", { sensitivity: "base" });
}

export function compareLoansByDate(a, b) {
  const dateCompare = (b.prestado_fecha || "").localeCompare(a.prestado_fecha || "");
  return dateCompare || compareMaterials(a, b);
}

export function formatShelf(value) {
  const shelf = normalizeShelf(value);
  return shelf ? SHELF_LABELS[shelf] : "Sin asignar";
}

export function formatQuantity(value) {
  return Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

export function formatTotalUnit(unit) {
  const label = cleanValue(unit) || "uds";
  return `${label} totales`;
}

export function formatLoanUnit(unit) {
  return cleanValue(unit) || "uds";
}

export function toRemoteRow(material) {
  const normalized = normalizeMaterial(material);
  return {
    id: normalized.id,
    codigo: normalized.codigo,
    nombre: normalized.nombre,
    tipo_material: normalized.tipo_material,
    estanteria: normalized.estanteria,
    seccion: normalized.seccion,
    cantidad: normalized.cantidad_comprobada ? normalized.cantidad : 0,
    cantidad_comprobada: normalized.cantidad_comprobada,
    unidad: normalized.unidad,
    ubicacion: normalized.ubicacion,
    estado_stock: normalized.estado_stock,
    pedido_hecho: normalized.pedido_hecho,
    prestado_cantidad: normalized.prestado_cantidad,
    prestado_fijo: normalized.prestado_fijo,
    prestado_fecha: normalized.prestado_fecha || null,
    observaciones: normalized.observaciones,
    ultima_actualizacion: normalized.ultima_actualizacion || null
  };
}

export function toRemoteCompatibleRow(material) {
  const row = toRemoteRow(material);
  REMOTE_OPTIONAL_FIELDS.forEach((field) => {
    delete row[field];
  });
  return row;
}

export function createId() {
  return `mat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
