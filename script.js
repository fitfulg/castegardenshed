const STORAGE_KEY = "almacen_materiales_v5";
const LEGACY_STORAGE_KEYS = ["almacen_materiales_v4", "almacen_materiales_v3"];
const REMOTE_TABLE = "materiales";
const REMOTE_OPTIONAL_FIELDS = ["seccion", "cantidad_comprobada"];
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
  C: "C - Desbroce, plantación y poda",
  D: "D - Solenoides, programadores, grifos y Techline",
  E: "E - Difusores, boquillas, aspersores y electroválvulas",
  F: "F - Tapones, collarines, enlaces, Té y codos",
  G: "G - Almacén de stock",
  A2: "Almacén 2 - Estantería A",
  B2: "Almacén 2 - Estantería B",
  C2: "Almacén 2 - Estantería C"
};

const SHELF_SECTIONS = {
  C: ["Desbroce", "Plantación", "Poda"],
  D: ["Solenoides", "Programadores", "Grifos", "Techline 16\"", "Techline 17\""],
  E: ["Difusores", "Boquillas", "Aspersores", "Bobinas", "Reducciones", "Electroválvulas"],
  F: ["Tapones", "Collarines", "Enlaces", "Té", "Codos"]
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
  url: "",
  anonKey: "",
  enabled: false,
  hasPendingLocalChanges: false,
  refreshing: false
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
  syncError: document.querySelector("#syncError"),
  materialsColumn: document.querySelector(".materials-column"),
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
  seccionInput: document.querySelector("#seccionInput"),
  cantidadInput: document.querySelector("#cantidadInput"),
  unidadInput: document.querySelector("#unidadInput"),
  estadoInput: document.querySelector("#estadoInput"),
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
  startRemoteRefresh();
  showConstructionNotice();
  render();
}

function initRemoteDatabase() {
  const config = window.CASTEGARDEN_SUPABASE || {};
  const hasConfig = config.url && config.anonKey
    && !String(config.url).includes("TU-PROYECTO")
    && !String(config.anonKey).includes("TU-CLAVE");

  if (!hasConfig) {
    setSyncStatus("Modo local", "");
    return;
  }

  remote.url = String(config.url).replace(/\/$/, "");
  remote.anonKey = config.anonKey;
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
    const data = await remoteRequest(`${REMOTE_TABLE}?select=*&order=tipo_material.asc,nombre.asc`);
    setSyncStatus("Sincronizado", "synced");
    return asArray(data).map(normalizeMaterial);
  } catch (error) {
    console.warn("No se pudo leer la base de datos remota.", error);
    setSyncStatus("Solo este dispositivo", "error", getErrorMessage(error));
    return [];
  }
}

function startRemoteRefresh() {
  if (!remote.enabled) return;

  window.addEventListener("focus", refreshRemoteMaterials);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshRemoteMaterials();
  });
  setInterval(refreshRemoteMaterials, 60000);
}

async function refreshRemoteMaterials() {
  if (!remote.enabled || remote.hasPendingLocalChanges || remote.refreshing) return;

  remote.refreshing = true;
  try {
    const remoteMaterials = await loadRemoteMaterials();
    if (remoteMaterials.length > 0) {
      state.materials = remoteMaterials;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteMaterials));
      render();
    }
  } finally {
    remote.refreshing = false;
  }
}

async function saveRemoteMaterials(materials) {
  if (!remote.enabled) return false;

  try {
    const rows = materials.map(toRemoteRow);
    await upsertRemoteRows(rows);
    remote.hasPendingLocalChanges = false;
    setSyncStatus("Sincronizado", "synced");
    return true;
  } catch (error) {
    try {
      const compatibleRows = materials.map(toRemoteCompatibleRow);
      await upsertRemoteRows(compatibleRows);
      remote.hasPendingLocalChanges = false;
      setSyncStatus("Sincronizado", "synced");
      console.warn("La base de datos remota no aceptó todos los campos. Se guardó una versión compatible.", error);
      return true;
    } catch (compatibleError) {
      console.warn("No se pudieron guardar los datos remotos.", compatibleError);
      remote.hasPendingLocalChanges = true;
      setSyncStatus("Solo este dispositivo", "error", getErrorMessage(compatibleError));
      return false;
    }
  }
}

async function remoteRequest(path, options = {}) {
  const response = await fetch(`${remote.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: remote.anonKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  if (!response.ok) {
    let details = text;
    try {
      const json = JSON.parse(text);
      details = json.message || json.msg || json.error || text;
    } catch (error) {
      details = text;
    }
    throw new Error(`${response.status} ${details}`.trim());
  }

  return text ? JSON.parse(text) : null;
}

async function upsertRemoteRows(rows) {
  await remoteRequest(`${REMOTE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
}

async function deleteRemoteMaterial(id) {
  if (!remote.enabled) return false;

  try {
    await remoteRequest(`${REMOTE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    });
    remote.hasPendingLocalChanges = false;
    setSyncStatus("Sincronizado", "synced");
    return true;
  } catch (error) {
    console.warn("No se pudo eliminar el material remoto.", error);
    remote.hasPendingLocalChanges = true;
    setSyncStatus("Solo este dispositivo", "error", getErrorMessage(error));
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
      scrollToMaterialsOnMobile();
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
  els.estanteriaInput.addEventListener("change", () => renderSectionOptions());
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

function renderSectionOptions(selectedValue = "") {
  const shelf = normalizeShelf(els.estanteriaInput.value);
  const sections = SHELF_SECTIONS[shelf] || [];
  const selected = cleanValue(selectedValue);

  els.seccionInput.innerHTML = "";
  els.seccionInput.append(new Option("Sin sección", ""));
  sections.forEach((section) => els.seccionInput.append(new Option(section, section)));

  if (selected && !sections.includes(selected)) {
    els.seccionInput.append(new Option(selected, selected));
  }

  els.seccionInput.value = selected || "";
  els.seccionInput.disabled = sections.length === 0 && !selected;
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

  const editButton = document.createElement("button");
  editButton.className = "card-edit-button";
  editButton.type = "button";
  editButton.title = "Editar material";
  editButton.ariaLabel = "Editar material";
  editButton.textContent = "✎";
  editButton.addEventListener("click", () => openMaterialDialog(material));
  titleRow.append(editButton);

  const meta = document.createElement("div");
  meta.className = "material-meta";
  meta.append(
    element("span", "quantity-line", ["Cantidad: ", createQuantityControl(material)]),
    element("span", "", `Estantería: ${formatShelf(material.estanteria)}`)
  );
  if (material.seccion) meta.append(element("span", "", `Sección: ${material.seccion}`));
  meta.append(
    element("span", "", `Actualizado: ${material.ultima_actualizacion || "Sin fecha"}`)
  );
  if (material.observaciones) meta.append(element("span", "", `Observaciones: ${material.observaciones}`));

  main.append(titleRow, meta);

  const actions = document.createElement("div");
  actions.className = "material-actions";

  actions.append(createStockSwitch(material));
  actions.append(createPedidoSwitch(material));

  const reviewButton = document.createElement("button");
  reviewButton.className = "review-button";
  reviewButton.type = "button";
  reviewButton.textContent = "Revisar";
  reviewButton.addEventListener("click", () => markAsReview(material.id));

  actions.append(reviewButton);
  card.append(main, actions);

  return card;
}

function createStockSwitch(material) {
  const label = document.createElement("label");
  label.className = "stock-switch";
  label.title = "Cambiar entre stock correcto y falta material";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = material.estado_stock === "verde";
  input.addEventListener("change", () => toggleStockState(material.id, input.checked));

  label.append(input, element("span", "switch-track", ""), element("span", "switch-text", input.checked ? "Stock correcto" : "Faltan"));
  return label;
}

function createPedidoSwitch(material) {
  const label = document.createElement("label");
  label.className = "stock-switch order-switch";
  label.title = "Marcar si el material ya esta pedido";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(material.pedido_hecho);
  input.addEventListener("change", () => togglePedidoState(material.id, input.checked));

  label.append(input, element("span", "switch-track", ""), element("span", "switch-text", input.checked ? "Material pedido" : "Sin pedir"));
  return label;
}

function createQuantityControl(material) {
  const wrapper = document.createElement("span");
  wrapper.className = `quantity-editor ${material.estado_stock === "verde" ? "" : material.estado_stock}`;

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.inputMode = "decimal";
  input.ariaLabel = `Cantidad de ${material.nombre || material.codigo || "material"}`;
  input.placeholder = material.cantidad_comprobada ? "" : "Stock correcto";
  input.value = material.cantidad_comprobada && material.cantidad !== null ? String(material.cantidad).replace(",", ".") : "";

  const unit = element("span", "quantity-unit", material.unidad || "uds");

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener("blur", () => saveInlineQuantity(material.id, input.value));

  wrapper.append(input, unit);
  return wrapper;
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
    material.seccion,
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
  renderSectionOptions(material?.seccion || inferSection(material || {}));
  els.cantidadInput.value = material?.cantidad_comprobada ? material.cantidad : "";
  els.unidadInput.value = material?.unidad || "";
  els.estadoInput.value = material?.estado_stock || "verde";
  els.observacionesInput.value = material?.observaciones || "";
  els.pedidoInput.checked = Boolean(material?.pedido_hecho);
  els.materialDialog.showModal();
  els.nombreInput.focus();
}

async function saveMaterialFromForm(event) {
  event.preventDefault();

  const id = els.materialId.value || createId();
  const quantity = normalizeQuantity(els.cantidadInput.value);
  const hasCheckedQuantity = cleanValue(els.cantidadInput.value) !== "";
  const material = normalizeMaterial({
    id,
    codigo: els.codigoInput.value,
    nombre: els.nombreInput.value,
    tipo_material: els.tipoInput.value,
    estanteria: els.estanteriaInput.value,
    seccion: els.seccionInput.value,
    cantidad: els.cantidadInput.value,
    cantidad_comprobada: hasCheckedQuantity,
    unidad: els.unidadInput.value,
    estado_stock: hasCheckedQuantity && quantity === 0 ? "rojo" : els.estadoInput.value,
    ubicacion: state.materials.find((item) => item.id === id)?.ubicacion || "",
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

async function togglePedidoState(id, isOrdered) {
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;
  material.pedido_hecho = isOrdered;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender();
}

async function toggleStockState(id, hasStock) {
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.estado_stock = hasStock ? "verde" : "rojo";
  material.cantidad = hasStock ? null : 0;
  material.cantidad_comprobada = !hasStock;
  material.pedido_hecho = false;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender();
}

async function saveInlineQuantity(id, value) {
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  const text = cleanValue(value);
  if (text === "") return;

  const quantity = normalizeQuantity(text);
  if (quantity === null || quantity < 0) return;
  if (material.cantidad_comprobada && material.cantidad === quantity) return;

  material.cantidad = quantity;
  material.cantidad_comprobada = true;
  material.estado_stock = quantity === 0 ? "rojo" : material.estado_stock === "rojo" ? "amarillo" : material.estado_stock;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender();
}

async function markAsReview(id) {
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.estado_stock = "amarillo";
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

function scrollToMaterialsOnMobile() {
  if (!els.materialsColumn || !window.matchMedia("(max-width: 700px)").matches) return;

  window.requestAnimationFrame(() => {
    els.materialsColumn.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  const header = ["codigo", "nombre", "tipo_material", "estanteria", "seccion", "cantidad", "cantidad_comprobada", "unidad", "estado_stock", "pedido_hecho", "ubicacion", "observaciones", "ultima_actualizacion"];
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

function setSyncStatus(text, statusClass, title = "") {
  if (!els.syncStatus) return;
  els.syncStatus.textContent = text;
  els.syncStatus.title = title;
  if (els.syncError) {
    els.syncError.textContent = title ? `Error: ${title}` : "";
    els.syncError.hidden = !title;
  }
  els.syncStatus.classList.toggle("synced", statusClass === "synced");
  els.syncStatus.classList.toggle("error", statusClass === "error");
}

function getErrorMessage(error) {
  return error?.message || "No se ha podido conectar con Supabase";
}

function toRemoteRow(material) {
  const normalized = normalizeMaterial(material);
  return {
    id: normalized.id,
    codigo: normalized.codigo,
    nombre: normalized.nombre,
    tipo_material: normalized.tipo_material,
    estanteria: normalized.estanteria,
    seccion: normalized.seccion,
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

function toRemoteCompatibleRow(material) {
  const row = toRemoteRow(material);
  REMOTE_OPTIONAL_FIELDS.forEach((field) => {
    delete row[field];
  });
  return row;
}

function normalizeMaterial(raw) {
  const material = raw && typeof raw === "object" ? raw : {};
  const cantidad = normalizeQuantity(material.cantidad);
  const codigo = cleanValue(material.codigo);
  const estanteria = normalizeShelf(material.estanteria);
  const seccion = cleanValue(material.seccion) || inferSection({ ...material, estanteria });
  const hasExplicitCheckedQuantity = material.cantidad_comprobada === true;
  const checkedStock = hasExplicitCheckedQuantity ? null : MANUALLY_CHECKED_STOCK[codigo];
  const cantidadComprobada = hasExplicitCheckedQuantity || Boolean(checkedStock);
  const estado = checkedStock ? checkedStock.estado_stock : normalizeText(material.estado_stock || "verde");

  return {
    id: String(material.id || material.codigo || createId()),
    codigo,
    nombre: cleanValue(material.nombre) || "Sin nombre",
    tipo_material: cleanValue(material.tipo_material) || "Sin tipo",
    estanteria,
    seccion,
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

function inferSection(material) {
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
