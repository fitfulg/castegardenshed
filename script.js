const STORAGE_KEY = "almacen_materiales_v5";
const LEGACY_STORAGE_KEYS = ["almacen_materiales_v4", "almacen_materiales_v3"];
const REMOTE_TABLE = "materiales";
const MANUALLY_CHECKED_STOCK = {
  "64017": { cantidad: 0, estado_stock: "rojo", pedido_hecho: true },
  "64031": { cantidad: 1, estado_stock: "rojo", pedido_hecho: true, observaciones: "1 rollo + pico" },
  "64032": { cantidad: 1, estado_stock: "rojo", pedido_hecho: true, observaciones: "1 rollo + pico" },
  "80330": { cantidad: 3, estado_stock: "amarillo" },
  "80313": { cantidad: 0, estado_stock: "amarillo" }
};

const SHELF_LABELS = {
  A: "A - EPI",
  B: "B - Herramientas",
  C: "C - Desbroce y poda",
  D: "D - Techline, programadores y solenoides",
  E: "E - Aspersores y electroválvulas",
  F: "F - Enlaces, codos, reducciones, T, tapones",
  G: "G - Almacén de stock",
  A2: "Almacén 2 - Estantería A",
  B2: "Almacén 2 - Estantería B",
  C2: "Almacén 2 - Estantería C"
};

const state = {
  materials: [],
  search: "",
  stockFilter: "todos",
  typeFilter: "todos",
  shelfFilter: "todos",
  summaryTypeFilter: "todos",
  groupByType: false
};

const remote = {
  client: null,
  enabled: false
};

const els = {
  searchInput: document.querySelector("#searchInput"),
  materialsList: document.querySelector("#materialsList"),
  emptyState: document.querySelector("#emptyState"),
  resultCount: document.querySelector("#resultCount"),
  typeFilter: document.querySelector("#typeFilter"),
  shelfFilter: document.querySelector("#shelfFilter"),
  summaryTypeFilter: document.querySelector("#summaryTypeFilter"),
  weeklySummary: document.querySelector("#weeklySummary"),
  copySummaryButton: document.querySelector("#copySummaryButton"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  copyNotice: document.querySelector("#copyNotice"),
  constructionNotice: document.querySelector("#constructionNotice"),
  syncStatus: document.querySelector("#syncStatus"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  toggleGroupButton: document.querySelector("#toggleGroupButton"),
  openNewMaterialButton: document.querySelector("#openNewMaterialButton"),
  materialDialog: document.querySelector("#materialDialog"),
  materialForm: document.querySelector("#materialForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
  deleteMaterialButton: document.querySelector("#deleteMaterialButton"),
  materialId: document.querySelector("#materialId"),
  codigoInput: document.querySelector("#codigoInput"),
  nombreInput: document.querySelector("#nombreInput"),
  tipoInput: document.querySelector("#tipoInput"),
  estanteriaInput: document.querySelector("#estanteriaInput"),
  cantidadInput: document.querySelector("#cantidadInput"),
  unidadInput: document.querySelector("#unidadInput"),
  estadoInput: document.querySelector("#estadoInput"),
  ubicacionInput: document.querySelector("#ubicacionInput"),
  observacionesInput: document.querySelector("#observacionesInput"),
  pedidoInput: document.querySelector("#pedidoInput"),
  totalCount: document.querySelector("#totalCount"),
  greenCount: document.querySelector("#greenCount"),
  yellowCount: document.querySelector("#yellowCount"),
  redCount: document.querySelector("#redCount"),
  orderCount: document.querySelector("#orderCount"),
  typeCounts: document.querySelector("#typeCounts")
};

init();

async function init() {
  initRemoteDatabase();
  state.materials = await loadMaterials();
  bindEvents();
  showConstructionNotice();
  render();
}

function initRemoteDatabase() {
  const config = window.CASTEGARDEN_SUPABASE || {};
  const hasConfig = config.url && config.anonKey
    && !String(config.url).includes("TU-PROYECTO")
    && !String(config.anonKey).includes("TU-CLAVE");

  if (!hasConfig || !window.supabase?.createClient) {
    setSyncStatus("Modo local", "");
    return;
  }

  remote.client = window.supabase.createClient(config.url, config.anonKey);
  remote.enabled = true;
  setSyncStatus("Conectando...", "error");
}

function showConstructionNotice() {
  if (!els.constructionNotice) return;

  setTimeout(() => {
    els.constructionNotice.classList.add("is-hidden");
  }, 6500);
}

async function loadMaterials() {
  const savedMaterials = loadSavedMaterials(STORAGE_KEY);
  const legacyMaterials = savedMaterials.length > 0 ? [] : loadLegacyMaterials();
  const localMaterials = savedMaterials.length > 0 ? savedMaterials : legacyMaterials;

  if (remote.enabled) {
    const remoteMaterials = await loadRemoteMaterials();
    if (remoteMaterials.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteMaterials));
      return remoteMaterials;
    }

    const seedMaterials = localMaterials.length > 0 ? localMaterials : await loadDataFile();
    if (seedMaterials.length > 0) {
      await saveRemoteMaterials(seedMaterials);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedMaterials));
      return seedMaterials;
    }
  }

  if (savedMaterials.length > 0) return savedMaterials;
  if (legacyMaterials.length > 0) return legacyMaterials;

  return loadDataFile();
}

function loadLegacyMaterials() {
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    const legacyMaterials = loadSavedMaterials(legacyKey);
    if (legacyMaterials.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyMaterials));
      return legacyMaterials;
    }
  }

  return [];
}

async function loadDataFile() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      return asArray(data).map(normalizeMaterial);
    }
  } catch (error) {
    console.warn("No se pudo cargar data.json. Se usan datos internos de ejemplo.", error);
  }

  return [];
}

async function loadRemoteMaterials() {
  try {
    const { data, error } = await remote.client
      .from(REMOTE_TABLE)
      .select("*")
      .order("tipo_material", { ascending: true })
      .order("nombre", { ascending: true });

    if (error) throw error;
    setSyncStatus("Sincronizado", "synced");
    return asArray(data).map(normalizeMaterial);
  } catch (error) {
    console.warn("No se pudo leer la base de datos remota.", error);
    remote.enabled = false;
    setSyncStatus("Modo local", "error");
    return [];
  }
}

async function saveRemoteMaterials(materials) {
  if (!remote.enabled) return false;

  try {
    const rows = materials.map(toRemoteRow);
    const { error } = await remote.client
      .from(REMOTE_TABLE)
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
    setSyncStatus("Sincronizado", "synced");
    return true;
  } catch (error) {
    console.warn("No se pudieron guardar los datos remotos.", error);
    setSyncStatus("Guardado local", "error");
    return false;
  }
}

async function deleteRemoteMaterial(id) {
  if (!remote.enabled) return false;

  try {
    const { error } = await remote.client
      .from(REMOTE_TABLE)
      .delete()
      .eq("id", id);

    if (error) throw error;
    setSyncStatus("Sincronizado", "synced");
    return true;
  } catch (error) {
    console.warn("No se pudo eliminar el material remoto.", error);
    setSyncStatus("Guardado local", "error");
    return false;
  }
}

function loadSavedMaterials(storageKey) {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];

  try {
    return asArray(JSON.parse(saved)).map(normalizeMaterial);
  } catch (error) {
    console.warn("No se pudieron cargar los datos guardados.", error);
    return [];
  }
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    renderMaterials();
  });

  document.querySelectorAll("[data-stock-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.stockFilter = button.dataset.stockFilter;
      document.querySelectorAll("[data-stock-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      renderMaterials();
    });
  });

  els.typeFilter.addEventListener("change", () => {
    state.typeFilter = els.typeFilter.value;
    renderMaterials();
  });

  els.shelfFilter.addEventListener("change", () => {
    state.shelfFilter = els.shelfFilter.value;
    renderMaterials();
  });

  els.summaryTypeFilter.addEventListener("change", () => {
    state.summaryTypeFilter = els.summaryTypeFilter.value;
    renderSummary();
  });

  els.clearFiltersButton.addEventListener("click", clearFilters);
  els.copySummaryButton.addEventListener("click", copySummary);
  els.exportCsvButton.addEventListener("click", exportCsv);
  els.openNewMaterialButton.addEventListener("click", () => openMaterialDialog());
  els.toggleGroupButton.addEventListener("click", toggleGroupByType);
  els.closeDialogButton.addEventListener("click", () => els.materialDialog.close());
  els.materialForm.addEventListener("submit", saveMaterialFromForm);
  els.deleteMaterialButton.addEventListener("click", deleteCurrentMaterial);
}

function render() {
  renderTypeOptions();
  renderShelfOptions();
  renderStats();
  renderTypeCounts();
  renderMaterials();
  renderSummary();
}

function renderTypeOptions() {
  const types = getTypes();
  fillSelect(els.typeFilter, "Todos los tipos", types, state.typeFilter);
  fillSelect(els.summaryTypeFilter, "Todos", types, state.summaryTypeFilter);
}

function renderShelfOptions() {
  els.shelfFilter.innerHTML = "";
  els.shelfFilter.append(new Option("Todas", "todos"));
  Object.entries(SHELF_LABELS).forEach(([value, label]) => {
    els.shelfFilter.append(new Option(label, value));
  });
  els.shelfFilter.value = SHELF_LABELS[state.shelfFilter] ? state.shelfFilter : "todos";
}

function fillSelect(select, firstLabel, values, selectedValue) {
  select.innerHTML = "";
  select.append(new Option(firstLabel, "todos"));
  values.forEach((type) => select.append(new Option(type, type)));
  select.value = values.includes(selectedValue) ? selectedValue : "todos";
}

function renderStats() {
  const total = state.materials.length;
  const green = state.materials.filter((item) => item.estado_stock === "verde").length;
  const yellow = state.materials.filter((item) => item.estado_stock === "amarillo").length;
  const red = state.materials.filter((item) => item.estado_stock === "rojo").length;
  const ordered = state.materials.filter((item) => item.pedido_hecho).length;

  els.totalCount.textContent = total;
  els.greenCount.textContent = green;
  els.yellowCount.textContent = yellow;
  els.redCount.textContent = red;
  els.orderCount.textContent = ordered;
}

function renderTypeCounts() {
  const counts = state.materials.reduce((acc, item) => {
    const type = item.tipo_material || "Sin tipo";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  els.typeCounts.innerHTML = "";
  Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .forEach(([type, count]) => {
      const pill = document.createElement("span");
      pill.className = "type-count";
      pill.textContent = `${type}: ${count}`;
      els.typeCounts.append(pill);
    });
}

function renderMaterials() {
  const materials = getFilteredMaterials();
  els.materialsList.innerHTML = "";
  els.resultCount.textContent = `${materials.length} resultado${materials.length === 1 ? "" : "s"}`;
  els.emptyState.hidden = materials.length > 0;
  els.toggleGroupButton.textContent = state.groupByType ? "Vista lista" : "Agrupar por tipo";

  const fragment = document.createDocumentFragment();
  if (state.groupByType) {
    Object.entries(groupMaterialsByType(materials)).forEach(([type, groupMaterials]) => {
      const group = document.createElement("section");
      group.className = "type-group";
      group.append(element("h3", "type-group-title", `${type} (${groupMaterials.length})`));
      groupMaterials.forEach((material) => group.append(createMaterialCard(material)));
      fragment.append(group);
    });
  } else {
    materials.forEach((material) => fragment.append(createMaterialCard(material)));
  }
  els.materialsList.append(fragment);
}

function createMaterialCard(material) {
  const card = document.createElement("article");
  card.className = `material-card stock-${material.estado_stock}`;

  const main = document.createElement("div");
  main.className = "material-main";

  const titleRow = document.createElement("div");
  titleRow.className = "material-title-row";
  titleRow.append(
    element("span", "shelf-badge", material.estanteria || "-"),
    element("span", "material-code", highlight(material.codigo || "Sin código")),
    element("span", "material-name", highlight(material.nombre || "Sin nombre")),
    element("span", "tag type-tag", highlight(material.tipo_material || "Sin tipo"))
  );

  if (material.pedido_hecho) {
    titleRow.append(element("span", "tag order-tag", "✓ Material pedido"));
  }

  const quantityClass = material.estado_stock === "verde" ? "" : material.estado_stock;
  const quantityLabel = material.cantidad_comprobada
    ? `${formatQuantity(material.cantidad)} ${material.unidad || ""}`.trim()
    : "Stock correcto";
  const quantity = element("span", `quantity ${quantityClass}`, quantityLabel);

  const meta = document.createElement("div");
  meta.className = "material-meta";
  meta.append(
    element("span", "", ["Cantidad: ", quantity]),
    element("span", "", `Estantería: ${formatShelf(material.estanteria)}`),
    element("span", "", `Ubicación: ${material.ubicacion || "Sin ubicación"}`),
    element("span", "", `Actualizado: ${material.ultima_actualizacion || "Sin fecha"}`),
    element("span", "", `Observaciones: ${material.observaciones || "Sin observaciones"}`)
  );

  main.append(titleRow, meta);

  const actions = document.createElement("div");
  actions.className = "material-actions";

  const toggleOrderButton = document.createElement("button");
  toggleOrderButton.className = material.pedido_hecho ? "secondary-button" : "primary-button";
  toggleOrderButton.type = "button";
  toggleOrderButton.textContent = material.pedido_hecho ? "✓ Material pedido" : "Marcar pedido";
  toggleOrderButton.addEventListener("click", () => togglePedido(material.id));

  const editButton = document.createElement("button");
  editButton.className = "secondary-button";
  editButton.type = "button";
  editButton.textContent = "Editar";
  editButton.addEventListener("click", () => openMaterialDialog(material));

  actions.append(toggleOrderButton, editButton);
  card.append(main, actions);

  return card;
}

function renderSummary() {
  const summaryItems = getSummaryItems();
  els.weeklySummary.textContent = buildSummaryText(summaryItems);
}

function getFilteredMaterials() {
  const query = normalizeText(state.search);

  return state.materials
    .filter((material) => matchesStockFilter(material, state.stockFilter))
    .filter((material) => state.typeFilter === "todos" || material.tipo_material === state.typeFilter)
    .filter((material) => state.shelfFilter === "todos" || material.estanteria === state.shelfFilter)
    .map((material) => ({ material, score: getSearchScore(material, query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || compareMaterials(a.material, b.material))
    .map(({ material }) => material);
}

function matchesStockFilter(material, filter) {
  if (filter === "todos") return true;
  if (filter === "pedido") return material.pedido_hecho;
  return material.estado_stock === filter;
}

function getSearchScore(material, query) {
  if (!query) return 0;

  const fields = [
    material.codigo,
    material.nombre,
    material.tipo_material,
    material.estanteria,
    formatShelf(material.estanteria),
    material.ubicacion
  ].map(normalizeText);
  if (fields.some((field) => field === query)) return 0;
  if (fields.some((field) => field.startsWith(query))) return 1;
  if (fields.some((field) => field.includes(query))) return 2;

  return -1;
}

function compareMaterials(a, b) {
  return (a.tipo_material || "").localeCompare(b.tipo_material || "", "es", { sensitivity: "base" })
    || (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
    || (a.codigo || "").localeCompare(b.codigo || "", "es", { sensitivity: "base" });
}

function openMaterialDialog(material = null) {
  const isEdit = Boolean(material);
  els.dialogTitle.textContent = isEdit ? "Editar material" : "Añadir material";
  els.deleteMaterialButton.hidden = !isEdit;
  els.materialId.value = material?.id || "";
  els.codigoInput.value = material?.codigo || "";
  els.nombreInput.value = material?.nombre || "";
  els.tipoInput.value = material?.tipo_material || "";
  els.estanteriaInput.value = material?.estanteria || "";
  els.cantidadInput.value = material?.cantidad_comprobada ? material.cantidad : "";
  els.unidadInput.value = material?.unidad || "";
  els.estadoInput.value = material?.estado_stock || "verde";
  els.ubicacionInput.value = material?.ubicacion || "";
  els.observacionesInput.value = material?.observaciones || "";
  els.pedidoInput.checked = Boolean(material?.pedido_hecho);
  els.materialDialog.showModal();
  els.nombreInput.focus();
}

async function saveMaterialFromForm(event) {
  event.preventDefault();

  const id = els.materialId.value || createId();
  const material = normalizeMaterial({
    id,
    codigo: els.codigoInput.value,
    nombre: els.nombreInput.value,
    tipo_material: els.tipoInput.value,
    estanteria: els.estanteriaInput.value,
    cantidad: els.cantidadInput.value,
    cantidad_comprobada: cleanValue(els.cantidadInput.value) !== "",
    unidad: els.unidadInput.value,
    estado_stock: els.estadoInput.value,
    ubicacion: els.ubicacionInput.value,
    pedido_hecho: els.pedidoInput.checked,
    observaciones: els.observacionesInput.value,
    ultima_actualizacion: new Date().toISOString().slice(0, 10)
  });

  const existingIndex = state.materials.findIndex((item) => item.id === id);
  if (existingIndex >= 0) {
    state.materials[existingIndex] = material;
  } else {
    state.materials.push(material);
  }

  await persistAndRender();
  els.materialDialog.close();
}

async function deleteCurrentMaterial() {
  const id = els.materialId.value;
  if (!id) return;
  const material = state.materials.find((item) => item.id === id);
  const name = material?.nombre || "este material";

  if (confirm(`Eliminar ${name}?`)) {
    state.materials = state.materials.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.materials));
    await deleteRemoteMaterial(id);
    render();
    els.materialDialog.close();
  }
}

async function togglePedido(id) {
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;
  material.pedido_hecho = !material.pedido_hecho;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender();
}

function toggleGroupByType() {
  state.groupByType = !state.groupByType;
  renderMaterials();
}

function clearFilters() {
  state.search = "";
  state.stockFilter = "todos";
  state.typeFilter = "todos";
  state.shelfFilter = "todos";
  els.searchInput.value = "";
  els.typeFilter.value = "todos";
  els.shelfFilter.value = "todos";
  document.querySelectorAll("[data-stock-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.stockFilter === "todos");
  });
  renderMaterials();
}

function groupMaterialsByType(materials) {
  return materials.reduce((groups, material) => {
    const type = material.tipo_material || "Sin tipo";
    if (!groups[type]) groups[type] = [];
    groups[type].push(material);
    return groups;
  }, {});
}

function getSummaryItems() {
  return state.materials
    .filter((item) => ["rojo", "amarillo"].includes(item.estado_stock))
    .filter((item) => state.summaryTypeFilter === "todos" || item.tipo_material === state.summaryTypeFilter)
    .sort((a, b) => {
      const stockOrder = { rojo: 0, amarillo: 1, verde: 2 };
      return stockOrder[a.estado_stock] - stockOrder[b.estado_stock] || compareMaterials(a, b);
    });
}

function buildSummaryText(items) {
  const red = items.filter((item) => item.estado_stock === "rojo");
  const yellow = items.filter((item) => item.estado_stock === "amarillo");

  return [
    "MATERIALES QUE FALTAN",
    red.length ? red.map(formatSummaryLine).join("\n") : "- Sin materiales que falten",
    "",
    "MATERIALES A REVISAR",
    yellow.length ? yellow.map(formatSummaryLine).join("\n") : "- Sin materiales a revisar"
  ].join("\n");
}

function formatSummaryLine(item) {
  const orderState = item.pedido_hecho ? "Material pedido" : "Sin pedir";
  const quantity = item.cantidad_comprobada ? `${formatQuantity(item.cantidad)} ${item.unidad || ""}`.trim() : "Stock correcto";
  return `- ${item.codigo || "Sin código"} | ${item.nombre || "Sin nombre"} | ${formatShelf(item.estanteria)} | ${quantity} | ${orderState}`;
}

async function copySummary() {
  const text = els.weeklySummary.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  els.copyNotice.hidden = false;
  setTimeout(() => {
    els.copyNotice.hidden = true;
  }, 1800);
}

function exportCsv() {
  const rows = getSummaryItems();
  const header = ["codigo", "nombre", "tipo_material", "estanteria", "cantidad", "cantidad_comprobada", "unidad", "estado_stock", "pedido_hecho", "ubicacion", "observaciones", "ultima_actualizacion"];
  const csv = [
    header.join(","),
    ...rows.map((item) => header.map((field) => csvCell(item[field])).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resumen-semanal-almacen-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = value === true ? "si" : value === false ? "no" : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.materials));
  await saveRemoteMaterials(state.materials);
  render();
}

function setSyncStatus(text, statusClass) {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = text;
  els.syncStatus.classList.toggle("synced", statusClass === "synced");
  els.syncStatus.classList.toggle("error", statusClass === "error");
}

function toRemoteRow(material) {
  const normalized = normalizeMaterial(material);
  return {
    id: normalized.id,
    codigo: normalized.codigo,
    nombre: normalized.nombre,
    tipo_material: normalized.tipo_material,
    estanteria: normalized.estanteria,
    cantidad: normalized.cantidad,
    cantidad_comprobada: normalized.cantidad_comprobada,
    unidad: normalized.unidad,
    ubicacion: normalized.ubicacion,
    estado_stock: normalized.estado_stock,
    pedido_hecho: normalized.pedido_hecho,
    observaciones: normalized.observaciones,
    ultima_actualizacion: normalized.ultima_actualizacion
  };
}

function normalizeMaterial(raw) {
  const material = raw && typeof raw === "object" ? raw : {};
  const cantidad = normalizeQuantity(material.cantidad);
  const codigo = cleanValue(material.codigo);
  const hasExplicitCheckedQuantity = material.cantidad_comprobada === true;
  const checkedStock = hasExplicitCheckedQuantity ? null : MANUALLY_CHECKED_STOCK[codigo];
  const cantidadComprobada = hasExplicitCheckedQuantity || Boolean(checkedStock);
  const estado = checkedStock ? checkedStock.estado_stock : normalizeText(material.estado_stock || "verde");

  return {
    id: String(material.id || material.codigo || createId()),
    codigo,
    nombre: cleanValue(material.nombre) || "Sin nombre",
    tipo_material: cleanValue(material.tipo_material) || "Sin tipo",
    estanteria: normalizeShelf(material.estanteria),
    cantidad: checkedStock ? checkedStock.cantidad : cantidad,
    cantidad_comprobada: cantidadComprobada,
    unidad: cleanValue(material.unidad),
    ubicacion: cleanValue(material.ubicacion),
    estado_stock: ["pendiente", "verde", "amarillo", "rojo"].includes(estado) ? estado : "verde",
    pedido_hecho: checkedStock?.pedido_hecho ?? Boolean(material.pedido_hecho),
    observaciones: cleanValue(checkedStock?.observaciones ?? material.observaciones),
    ultima_actualizacion: cleanValue(material.ultima_actualizacion)
  };
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.materiales)) return data.materiales;
  return [];
}

function cleanValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeQuantity(value) {
  const text = cleanValue(value);
  if (text === "") return null;

  const quantity = Number(text.replace(",", "."));
  return Number.isFinite(quantity) ? quantity : null;
}

function normalizeText(value) {
  return cleanValue(value)
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getTypes() {
  return [...new Set(state.materials.map((item) => item.tipo_material || "Sin tipo"))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function normalizeShelf(value) {
  const shelf = cleanValue(value).toUpperCase();
  return SHELF_LABELS[shelf] ? shelf : "";
}

function formatShelf(value) {
  const shelf = normalizeShelf(value);
  return shelf ? SHELF_LABELS[shelf] : "Sin asignar";
}

function formatQuantity(value) {
  return Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

function createId() {
  return `mat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;

  if (Array.isArray(content)) {
    content.forEach((part) => {
      if (part instanceof Node) {
        node.append(part);
      } else {
        node.append(document.createTextNode(String(part)));
      }
    });
  } else if (content instanceof Node) {
    node.append(content);
  } else {
    node.textContent = String(content ?? "");
  }

  return node;
}

function highlight(value) {
  const text = String(value ?? "");
  const query = normalizeText(state.search);
  if (!query) return document.createTextNode(text);

  const normalizedText = normalizeText(text);
  const index = normalizedText.indexOf(query);
  if (index < 0) return document.createTextNode(text);

  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(text.slice(0, index)));
  fragment.append(element("mark", "highlight", text.slice(index, index + query.length)));
  fragment.append(document.createTextNode(text.slice(index + query.length)));
  return fragment;
}
