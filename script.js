import {
  AUDIT_TABLE,
  APP_VERSION,
  LAST_UPDATE_KEY,
  LEGACY_STORAGE_KEYS,
  REMOTE_TABLE,
  SHELF_LABELS,
  SHELF_SECTIONS,
  STORAGE_KEY,
  USER_KEY,
  USER_SESSION_EXPIRES_AT_KEY,
  USER_SESSION_TIMEOUT_MS
} from "./js/app-config.js";
import {
  asArray,
  cleanValue,
  compareLoansByDate,
  compareMaterials,
  createId,
  formatLoanUnit,
  formatQuantity,
  formatShelf,
  formatTotalUnit,
  inferSection,
  normalizeMaterial,
  normalizeQuantity,
  normalizeShelf,
  normalizeText,
  toRemoteCompatibleRow,
  toRemoteRow
} from "./js/material-utils.js";
import { pickPlantUserOptions } from "./js/plant-users.js";

const state = {
  materials: [],
  search: "",
  stockFilter: "todos",
  typeFilter: "todos",
  shelfFilter: "todos",
  summaryTypeFilter: "todos",
  groupByType: false,
  activeView: "list",
  plantUserOptions: [],
  changeLog: [],
  changeLogError: "",
  userLogoutTimer: null
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
  lastUpdateNotice: document.querySelector("#lastUpdateNotice"),
  appVersion: document.querySelector("#appVersion"),
  currentUserTag: document.querySelector("#currentUserTag"),
  changeUserButton: document.querySelector("#changeUserButton"),
  syncStatus: document.querySelector("#syncStatus"),
  syncError: document.querySelector("#syncError"),
  materialsColumn: document.querySelector(".materials-column"),
  summaryPanel: document.querySelector(".summary-panel"),
  controlPanel: document.querySelector(".control-panel"),
  contentGrid: document.querySelector(".content-grid"),
  loanPanel: document.querySelector(".loan-panel"),
  changeLogPanel: document.querySelector(".change-log-panel"),
  typeCountsPanel: document.querySelector(".type-counts-panel"),
  loanList: document.querySelector("#loanList"),
  loanEmptyState: document.querySelector("#loanEmptyState"),
  changeLogList: document.querySelector("#changeLogList"),
  changeLogEmptyState: document.querySelector("#changeLogEmptyState"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  toggleGroupButton: document.querySelector("#toggleGroupButton"),
  showLoansButton: document.querySelector("#showLoansButton"),
  showLogButton: document.querySelector("#showLogButton"),
  showSummaryButton: document.querySelector("#showSummaryButton"),
  showListButton: document.querySelector("#showListButton"),
  showMainListButton: document.querySelector("#showMainListButton"),
  showListFromLogButton: document.querySelector("#showListFromLogButton"),
  refreshPageButton: document.querySelector("#refreshPageButton"),
  openNewMaterialButton: document.querySelector("#openNewMaterialButton"),
  materialDialog: document.querySelector("#materialDialog"),
  userDialog: document.querySelector("#userDialog"),
  plantUserOptions: document.querySelector("#plantUserOptions"),
  rerollUserOptionsButton: document.querySelector("#rerollUserOptionsButton"),
  closeUserDialogButton: document.querySelector("#closeUserDialogButton"),
  customUserForm: document.querySelector("#customUserForm"),
  customUserInput: document.querySelector("#customUserInput"),
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
  grayCount: document.querySelector("#grayCount"),
  orderCount: document.querySelector("#orderCount"),
  typeCounts: document.querySelector("#typeCounts")
};

init();

async function init() {
  renderAppVersion();
  initRemoteDatabase();
  state.materials = await loadMaterials();
  state.changeLog = await loadRemoteChangeLog();
  bindEvents();
  ensureCurrentUser();
  renderCurrentUser();
  startRemoteRefresh();
  showConstructionNotice();
  render();
}

function renderAppVersion() {
  document.documentElement.dataset.appVersion = APP_VERSION;
  if (els.appVersion) els.appVersion.textContent = `v${APP_VERSION}`;
}

function getStoredUser() {
  return cleanValue(localStorage.getItem(USER_KEY));
}

function getCurrentUser() {
  return getStoredUser() || "Sin identificar";
}

function setCurrentUser(value) {
  const user = cleanValue(value) || "Sin identificar";
  localStorage.setItem(USER_KEY, user);
  renewUserSession();
  renderCurrentUser();
  els.userDialog?.close();
}

function ensureCurrentUser() {
  if (hasActiveUserSession()) {
    scheduleUserSessionExpiry();
    return;
  }
  openUserDialog();
}

function requireCurrentUser() {
  if (hasActiveUserSession()) return true;
  openUserDialog();
  setSyncStatus("Escoge usuario", "error", "La sesión ha caducado. Escoge usuario antes de guardar cambios.");
  return false;
}

function getUserSessionExpiresAt() {
  const expiresAt = Number(localStorage.getItem(USER_SESSION_EXPIRES_AT_KEY));
  return Number.isFinite(expiresAt) ? expiresAt : 0;
}

function hasActiveUserSession() {
  if (!getStoredUser()) return false;

  const expiresAt = getUserSessionExpiresAt();
  if (!expiresAt || Date.now() >= expiresAt) {
    expireUserSession({ openDialog: false });
    return false;
  }

  return true;
}

function renewUserSession() {
  if (!getStoredUser()) return;
  localStorage.setItem(USER_SESSION_EXPIRES_AT_KEY, String(Date.now() + USER_SESSION_TIMEOUT_MS));
  scheduleUserSessionExpiry();
}

function scheduleUserSessionExpiry() {
  if (state.userLogoutTimer) clearTimeout(state.userLogoutTimer);
  if (!getStoredUser()) return;

  const remaining = getUserSessionExpiresAt() - Date.now();
  if (remaining <= 0) {
    expireUserSession();
    return;
  }

  state.userLogoutTimer = setTimeout(expireUserSession, remaining);
}

function resetUserSessionTimer() {
  renewUserSession();
}

function checkUserSessionExpiry() {
  if (getStoredUser() && !hasActiveUserSession() && !document.hidden) openUserDialog();
}

function expireUserSession(options = {}) {
  const { openDialog = true } = options;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_SESSION_EXPIRES_AT_KEY);
  if (state.userLogoutTimer) clearTimeout(state.userLogoutTimer);
  state.userLogoutTimer = null;
  renderCurrentUser();
  setSyncStatus("Escoge usuario", "error", "Sesión cerrada tras 5 minutos sin cambios.");
  if (openDialog && !document.hidden) openUserDialog();
}

function changeCurrentUser() {
  openUserDialog();
}

function renderCurrentUser() {
  if (els.currentUserTag) els.currentUserTag.textContent = `Usuario: ${getCurrentUser()}`;
}

function openUserDialog() {
  renderPlantUserOptions();
  if (els.customUserInput) els.customUserInput.value = "";
  if (els.userDialog?.showModal) {
    els.userDialog.showModal();
  }
}

function renderPlantUserOptions() {
  if (!els.plantUserOptions) return;

  state.plantUserOptions = pickPlantUserOptions(3);
  els.plantUserOptions.innerHTML = "";
  state.plantUserOptions.forEach((name) => {
    const button = document.createElement("button");
    button.className = "plant-option-button";
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => setCurrentUser(name));
    els.plantUserOptions.append(button);
  });
}

function saveCustomUser(event) {
  event.preventDefault();
  const user = cleanValue(els.customUserInput?.value);
  if (!user) return;
  setCurrentUser(user);
}

function markLastUpdate(date = new Date()) {
  localStorage.setItem(LAST_UPDATE_KEY, date.toISOString());
  renderLastUpdateNotice({ date, hasTime: true });
}

function getLastUpdateInfo() {
  const saved = localStorage.getItem(LAST_UPDATE_KEY);
  if (saved) {
    const date = new Date(saved);
    if (!Number.isNaN(date.getTime())) return { date, hasTime: true };
  }

  const latestDate = state.materials
    .map((material) => cleanValue(material.ultima_actualizacion))
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latestDate) return null;

  const date = new Date(`${latestDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { date, hasTime: false };
}

function materialsSnapshot(materials) {
  return JSON.stringify(asArray(materials).map(normalizeMaterial));
}

function markLastUpdateIfChanged(previousMaterials, nextMaterials) {
  if (materialsSnapshot(previousMaterials) !== materialsSnapshot(nextMaterials)) {
    markLastUpdate();
  }
}

function renderLastUpdateNotice(updateInfo = getLastUpdateInfo()) {
  if (!els.lastUpdateNotice) return;

  if (!updateInfo) {
    els.lastUpdateNotice.textContent = "Sin cambios registrados";
    els.lastUpdateNotice.title = "";
    return;
  }

  const dateText = new Intl.DateTimeFormat("es-ES", { dateStyle: "short" }).format(updateInfo.date);
  const timeText = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(updateInfo.date);
  const text = updateInfo.hasTime
    ? `Actualizado el ${dateText}, a las ${timeText}`
    : `Actualizado el ${dateText}`;

  els.lastUpdateNotice.textContent = text;
  els.lastUpdateNotice.title = text;
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
      markLastUpdateIfChanged(localMaterials, remoteMaterials);
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

async function loadRemoteChangeLog() {
  if (!remote.enabled) return [];

  try {
    const data = await remoteRequest(`${AUDIT_TABLE}?select=*&order=fecha.desc&limit=100`);
    state.changeLogError = "";
    return asArray(data).map(normalizeChangeLogEntry);
  } catch (error) {
    console.warn("No se pudo leer el registro de cambios.", error);
    state.changeLogError = getErrorMessage(error);
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
      markLastUpdateIfChanged(state.materials, remoteMaterials);
      state.materials = remoteMaterials;
      state.changeLog = await loadRemoteChangeLog();
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

function stampMaterialsForChange(materials, date = new Date()) {
  const changedAt = date.toISOString();
  asArray(materials).forEach((material) => {
    material.modificado_por = getCurrentUser();
    material.modificado_en = changedAt;
  });
  return changedAt;
}

async function recordRemoteChanges(materials, action) {
  if (!remote.enabled) return false;

  const rows = asArray(materials)
    .filter(Boolean)
    .map((material) => {
      const normalized = normalizeMaterial(material);
      return {
        id: `cambio-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        fecha: normalized.modificado_en || new Date().toISOString(),
        usuario: getCurrentUser(),
        accion: action,
        material_id: normalized.id,
        codigo: normalized.codigo,
        nombre: normalized.nombre,
        estado_stock: normalized.estado_stock,
        cantidad: normalized.cantidad_comprobada ? normalized.cantidad : null,
        pedido_hecho: normalized.pedido_hecho,
        observaciones: normalized.observaciones
      };
    });

  if (!rows.length) return false;

  try {
    await remoteRequest(AUDIT_TABLE, {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rows)
    });
    state.changeLogError = "";
    state.changeLog = [...rows.map(normalizeChangeLogEntry), ...state.changeLog].slice(0, 100);
    renderChangeLog();
    return true;
  } catch (error) {
    console.warn("No se pudo registrar el historial de cambios.", error);
    state.changeLogError = getErrorMessage(error);
    setSyncStatus("Log no guardado", "error", `Material guardado, pero no se pudo guardar el registro: ${state.changeLogError}`);
    renderChangeLog();
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

function normalizeChangeLogEntry(raw) {
  const entry = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(entry.id || createId()),
    fecha: cleanValue(entry.fecha),
    usuario: cleanValue(entry.usuario) || "Sin identificar",
    accion: cleanValue(entry.accion) || "modifico",
    material_id: cleanValue(entry.material_id),
    codigo: cleanValue(entry.codigo),
    nombre: cleanValue(entry.nombre) || "Sin nombre",
    estado_stock: cleanValue(entry.estado_stock),
    cantidad: normalizeQuantity(entry.cantidad),
    pedido_hecho: Boolean(entry.pedido_hecho),
    observaciones: cleanValue(entry.observaciones)
  };
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
  els.showLoansButton.addEventListener("click", () => setActiveView(state.activeView === "loans" ? "list" : "loans"));
  els.showLogButton.addEventListener("click", () => setActiveView(state.activeView === "log" ? "list" : "log"));
  els.showSummaryButton.addEventListener("click", () => setActiveView(isMobileView() ? "summary" : "list"));
  els.showListButton.addEventListener("click", () => setActiveView("list"));
  els.showMainListButton.addEventListener("click", () => setActiveView("list"));
  els.showListFromLogButton.addEventListener("click", () => setActiveView("list"));
  window.addEventListener("resize", renderActiveView);
  window.addEventListener("focus", checkUserSessionExpiry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkUserSessionExpiry();
  });
  els.refreshPageButton.addEventListener("click", () => window.location.reload());
  els.changeUserButton?.addEventListener("click", changeCurrentUser);
  els.rerollUserOptionsButton?.addEventListener("click", renderPlantUserOptions);
  els.closeUserDialogButton?.addEventListener("click", () => els.userDialog?.close());
  els.customUserForm?.addEventListener("submit", saveCustomUser);
  els.openNewMaterialButton.addEventListener("click", () => openMaterialDialog());
  els.toggleGroupButton.addEventListener("click", toggleGroupByType);
  els.closeDialogButton.addEventListener("click", () => els.materialDialog.close());
  els.materialForm.addEventListener("submit", saveMaterialFromForm);
  els.deleteMaterialButton.addEventListener("click", deleteCurrentMaterial);
  els.estanteriaInput.addEventListener("change", () => renderSectionOptions());
}

function render() {
  renderActiveView();
  renderLastUpdateNotice();
  renderTypeOptions();
  renderShelfOptions();
  renderStats();
  renderTypeCounts();
  renderMaterials();
  renderLoans();
  renderChangeLog();
  renderSummary();
}

function renderActiveView() {
  const isMobile = isMobileView();
  const isLoansView = state.activeView === "loans";
  const isLogView = state.activeView === "log";
  const isSummaryView = isMobile && state.activeView === "summary";

  els.controlPanel.hidden = isLoansView || isLogView || isSummaryView;
  els.contentGrid.hidden = isLoansView || isLogView;
  els.materialsColumn.hidden = isSummaryView;
  els.summaryPanel.hidden = isMobile && !isSummaryView;
  els.typeCountsPanel.hidden = isLoansView || isLogView || isSummaryView;
  els.loanPanel.hidden = !isLoansView;
  els.changeLogPanel.hidden = !isLogView;
  els.showLoansButton.textContent = isLoansView ? "Ver listado" : "Ver prestados";
  els.showLoansButton.setAttribute("aria-pressed", String(isLoansView));
  els.showLogButton.textContent = isLogView ? "Listado" : "Histórico";
  els.showLogButton.setAttribute("aria-pressed", String(isLogView));
  els.showSummaryButton.setAttribute("aria-pressed", String(isSummaryView));
}

function setActiveView(view) {
  state.activeView = ["loans", "log", "summary"].includes(view) ? view : "list";
  renderActiveView();
  scrollToSection(document.querySelector(".app-header"));
}

function isMobileView() {
  return window.matchMedia("(max-width: 560px)").matches;
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
  const gray = state.materials.filter((item) => item.estado_stock === "gris").length;
  const ordered = state.materials.filter((item) => item.pedido_hecho).length;

  els.totalCount.textContent = total;
  els.greenCount.textContent = green;
  els.yellowCount.textContent = yellow;
  els.redCount.textContent = red;
  els.grayCount.textContent = gray;
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

function renderLoans() {
  const loans = state.materials.filter(hasLoan);
  els.loanList.innerHTML = "";
  els.loanEmptyState.hidden = loans.length > 0;

  const fixedLoans = loans.filter((material) => material.prestado_fijo).sort(compareLoansByDate);
  const temporaryLoans = loans.filter((material) => !material.prestado_fijo).sort(compareLoansByDate);

  [
    { title: "Fijos", items: fixedLoans, tone: "fixed" },
    { title: "Temporales", items: temporaryLoans, tone: "temporary" }
  ].forEach((group) => {
    if (!group.items.length) return;

    const section = document.createElement("section");
    section.className = `loan-group ${group.tone}`;
    section.append(element("h3", "loan-group-title", `${group.title} (${group.items.length})`));

    group.items.forEach((material) => section.append(createLoanCard(material, group.tone)));
    els.loanList.append(section);
  });
}

function createLoanCard(material, tone) {
  const row = document.createElement("article");
  row.className = `loan-card ${tone}`;

  const loanText = `${formatQuantity(material.prestado_cantidad)} ${formatLoanUnit(material.unidad)}`;
  const fixedText = material.prestado_fijo ? "Fijo" : "Temporal";
  const dateText = material.prestado_fecha || "Sin fecha";

  row.append(
    element("div", "loan-main", [
      element("span", "material-code", material.codigo || "Sin código"),
      element("strong", "", material.nombre || "Sin nombre"),
      element("span", "loan-detail", `${loanText} a devolver - ${fixedText} - ${dateText}`)
    ])
  );

  const returnButton = document.createElement("button");
  returnButton.className = "secondary-button compact-button";
  returnButton.type = "button";
  returnButton.textContent = "Devuelto";
  returnButton.addEventListener("click", () => clearLoan(material.id));
  row.append(returnButton);

  return row;
}

function renderChangeLog() {
  els.changeLogList.innerHTML = "";
  els.changeLogEmptyState.hidden = state.changeLog.length > 0 && !state.changeLogError;

  if (!remote.enabled) {
    els.changeLogEmptyState.textContent = "El registro necesita Supabase conectado.";
    return;
  }

  if (state.changeLogError) {
    els.changeLogEmptyState.textContent = `No se pudo guardar o leer el registro de cambios: ${state.changeLogError}. Revisa que la tabla materiales_cambios exista en Supabase.`;
  }

  if (!state.changeLog.length) {
    if (!state.changeLogError) els.changeLogEmptyState.textContent = "No hay cambios registrados.";
    return;
  }

  const fragment = document.createDocumentFragment();
  state.changeLog.forEach((entry) => fragment.append(createChangeLogCard(entry)));
  els.changeLogList.append(fragment);
}

function createChangeLogCard(entry) {
  const row = document.createElement("article");
  row.className = "change-log-card";

  const materialText = [entry.nombre, entry.codigo ? `C.${entry.codigo}` : ""].filter(Boolean).join(" - ") || "material sin nombre";
  const title = element("div", "change-log-title");
  title.append(
    element("span", "change-log-prefix", "El usuario"),
    element("strong", "change-log-user", entry.usuario),
    element("span", "change-log-action", formatChangeAction(entry.accion)),
    element("strong", "change-log-material", materialText)
  );
  row.append(title, element("span", "change-log-date", formatChangeDate(entry.fecha)));

  const details = [];
  if (entry.estado_stock) details.push(`Estado: ${formatStockState(entry.estado_stock)}`);
  if (entry.cantidad !== null) details.push(`Cantidad: ${formatQuantity(entry.cantidad)}`);
  if (entry.pedido_hecho) details.push("Material pedido");
  if (entry.observaciones) details.push(formatObservationLine(entry.observaciones));
  if (details.length) row.append(element("span", "change-log-detail", details.join(" · ")));

  return row;
}

function formatChangeAction(action) {
  const labels = {
    "actualizar": "modificó",
    "crear": "creó",
    "editar": "editó",
    "eliminar": "eliminó",
    "material pedido": "marcó como pedido",
    "sin pedir": "quitó el pedido de",
    "stock correcto": "marcó como correcto",
    "faltan": "marcó como faltante",
    "cantidad": "modificó la cantidad de",
    "revisar": "marcó para revisar",
    "obsoleto": "marcó como obsoleto",
    "prestar": "prestó",
    "devuelto": "marcó como devuelto"
  };
  return labels[action] || "modificó";
}

function formatChangeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatStockState(value) {
  const labels = {
    verde: "Correcto",
    amarillo: "Revisar",
    rojo: "Faltan",
    gris: "Obsoleto",
    pendiente: "Pendiente"
  };
  return labels[value] || value;
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

  const quantityLine = ["Cantidad: ", createQuantityControl(material)];
  if (hasLoan(material)) quantityLine.push(createLoanBadge(material));

  const meta = document.createElement("div");
  meta.className = "material-meta";
  meta.append(
    element("span", "quantity-line", quantityLine),
    element("span", "", `Estantería: ${formatShelf(material.estanteria)}`)
  );
  if (material.seccion) meta.append(element("span", "", `Sección: ${material.seccion}`));
  const updatedBy = material.modificado_por ? ` por ${material.modificado_por}` : "";
  meta.append(element("span", "", `Actualizado: ${material.ultima_actualizacion || "Sin fecha"}${updatedBy}`));
  if (material.observaciones) meta.append(element("span", "material-observations", formatObservationLine(material.observaciones)));

  main.append(titleRow, meta);

  const actions = document.createElement("div");
  actions.className = "material-actions";

  actions.append(
    createActionButton("Correcto", material.estado_stock === "verde", "ok", () => toggleStockState(material.id, true)),
    createActionButton("Faltan", material.estado_stock === "rojo", "critical", () => toggleStockState(material.id, false)),
    createActionButton("Obsoleto", material.estado_stock === "gris", "paused", () => markAsNoRestock(material.id)),
    createActionButton("Pedido", material.pedido_hecho, "order", () => togglePedidoState(material.id, !material.pedido_hecho))
  );

  actions.append(createActionButton("Revisar", material.estado_stock === "amarillo", "review", () => markAsReview(material.id)));
  if (hasLoan(material)) {
    actions.append(
      createActionButton("Editar préstamo", true, "loan", () => lendMaterial(material.id)),
      createActionButton("Devuelto", true, "return", () => clearLoan(material.id))
    );
  } else {
    actions.append(createActionButton("Prestar", false, "loan", () => lendMaterial(material.id)));
  }
  card.append(main, actions);

  return card;
}

function createActionButton(text, isActive, tone, onClick) {
  const button = document.createElement("button");
  button.className = `state-button ${tone} ${isActive ? "active" : "inactive"}`;
  button.type = "button";
  button.textContent = text;
  button.setAttribute("aria-pressed", String(isActive));
  button.addEventListener("click", onClick);
  return button;
}

function createLoanBadge(material) {
  return element(
    "span",
    `loan-inline ${material.prestado_fijo ? "fixed" : "temporary"}`,
    `A devolver: ${formatQuantity(material.prestado_cantidad)} ${formatLoanUnit(material.unidad)} - ${material.prestado_fijo ? "Fijo" : "Temporal"}`
  );
}

function createQuantityControl(material) {
  if (!material.cantidad_comprobada) {
    const wrapper = document.createElement("span");
    wrapper.className = "quantity-display";

    const label = element("span", "quantity-status", "Stock correcto");
    const addButton = document.createElement("button");
    addButton.className = "quantity-add-button";
    addButton.type = "button";
    addButton.title = "Añadir cantidad";
    addButton.ariaLabel = "Añadir cantidad";
    addButton.textContent = "+ uds";
    addButton.addEventListener("click", () => {
      const editor = createQuantityEditor(material, "");
      wrapper.replaceWith(editor);
      editor.querySelector("input")?.focus();
    });

    wrapper.append(label, addButton);
    return wrapper;
  }

  return createQuantityEditor(material, material.cantidad !== null ? String(material.cantidad).replace(",", ".") : "");
}

function createQuantityEditor(material, value) {
  const wrapper = document.createElement("span");
  wrapper.className = `quantity-editor ${material.estado_stock === "verde" ? "" : material.estado_stock}`;

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.inputMode = "decimal";
  input.ariaLabel = `Cantidad de ${material.nombre || material.codigo || "material"}`;
  input.dataset.quantityId = material.id;
  input.value = value;

  const unit = element("span", "quantity-unit", formatTotalUnit(material.unidad));

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

function formatObservationDate(date = new Date()) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function hasTrailingDate(text) {
  return /\b\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/.test(cleanValue(text));
}

function splitTrailingObservationDate(value) {
  const text = cleanValue(value);
  const match = text.match(/(?:[.!?]\s*)?(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/);
  if (!match) return { text, date: "" };

  const note = text.slice(0, match.index).trim();
  return { text: note, date: match[1] };
}

function formatObservationLine(value) {
  const { text, date } = splitTrailingObservationDate(value);
  const label = date ? `Anotaciones ${date}` : "Anotaciones";
  return `${label}: ${text}`;
}

function prepareObservations(value, previousValue = "") {
  const text = cleanValue(value);
  if (!text) return "";
  if (text === cleanValue(previousValue) || hasTrailingDate(text)) return text;
  const separator = /[.!?]$/.test(text) ? " " : ". ";
  return `${text}${separator}${formatObservationDate()}`;
}

async function saveMaterialFromForm(event) {
  event.preventDefault();
  if (!requireCurrentUser()) return;

  const id = els.materialId.value || createId();
  const previousMaterial = state.materials.find((item) => item.id === id);
  const quantity = normalizeQuantity(els.cantidadInput.value);
  const hasCheckedQuantity = cleanValue(els.cantidadInput.value) !== "";
  const selectedStockState = cleanValue(els.estadoInput.value) || "verde";
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
    estado_stock: hasCheckedQuantity && quantity === 0 && selectedStockState !== "gris" ? "rojo" : selectedStockState,
    ubicacion: previousMaterial?.ubicacion || "",
    pedido_hecho: els.pedidoInput.checked,
    observaciones: prepareObservations(els.observacionesInput.value, previousMaterial?.observaciones),
    ultima_actualizacion: new Date().toISOString().slice(0, 10)
  });

  const existingIndex = state.materials.findIndex((item) => item.id === id);
  const action = existingIndex >= 0 ? "editar" : "crear";
  if (existingIndex >= 0) {
    state.materials[existingIndex] = material;
  } else {
    state.materials.push(material);
  }

  await persistAndRender(material, action);
  els.materialDialog.close();
}

async function deleteCurrentMaterial() {
  if (!requireCurrentUser()) return;
  const id = els.materialId.value;
  if (!id) return;
  const material = state.materials.find((item) => item.id === id);
  const name = material?.nombre || "este material";

  if (confirm(`Eliminar ${name}?`)) {
    const deletedMaterial = material
      ? normalizeMaterial({
          ...material,
          modificado_por: getCurrentUser(),
          modificado_en: new Date().toISOString()
        })
      : null;
    state.materials = state.materials.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.materials));
    markLastUpdate();
    const deleted = await deleteRemoteMaterial(id);
    if (deleted && deletedMaterial) await recordRemoteChanges(deletedMaterial, "eliminar");
    render();
    els.materialDialog.close();
  }
}

async function togglePedidoState(id, isOrdered) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;
  material.pedido_hecho = isOrdered;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, isOrdered ? "material pedido" : "sin pedir");
}

async function toggleStockState(id, hasStock) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.estado_stock = hasStock ? "verde" : "rojo";
  material.cantidad = hasStock ? null : 0;
  material.cantidad_comprobada = !hasStock;
  material.pedido_hecho = false;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, hasStock ? "stock correcto" : "faltan");
}

async function saveInlineQuantity(id, value) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  const text = cleanValue(value);
  if (text === "") {
    material.cantidad = null;
    material.cantidad_comprobada = false;
    material.estado_stock = "verde";
    material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
    await persistAndRender(material, "cantidad");
    return;
  }

  const quantity = normalizeQuantity(text);
  if (quantity === null || quantity < 0) return;
  if (material.cantidad_comprobada && material.cantidad === quantity) return;

  material.cantidad = quantity;
  material.cantidad_comprobada = true;
  if (quantity === 0) {
    material.estado_stock = material.estado_stock === "gris" ? "gris" : "rojo";
  } else if (["rojo", "gris"].includes(material.estado_stock)) {
    material.estado_stock = "verde";
  }
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, "cantidad");
}

async function markAsReview(id) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.estado_stock = "amarillo";
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, "revisar");
}

async function markAsNoRestock(id) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.estado_stock = "gris";
  material.cantidad = 0;
  material.cantidad_comprobada = true;
  material.pedido_hecho = false;
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, "obsoleto");
}

async function lendMaterial(id) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  const current = hasLoan(material) ? formatQuantity(material.prestado_cantidad) : "";
  const value = prompt(`Cantidad prestada de ${material.nombre || material.codigo || "material"}:`, current);
  if (value === null) return;

  const quantity = normalizeQuantity(value);
  if (quantity === null || quantity <= 0) {
    alert("Indica una cantidad mayor que 0.");
    return;
  }

  const fixed = confirm("¿Este préstamo es fijo?\n\nAceptar = fijo\nCancelar = temporal");
  material.prestado_cantidad = quantity;
  material.prestado_fijo = fixed;
  material.prestado_fecha = new Date().toISOString().slice(0, 10);
  material.ultima_actualizacion = material.prestado_fecha;
  await persistAndRender(material, "prestar");
}

async function clearLoan(id) {
  if (!requireCurrentUser()) return;
  const material = state.materials.find((item) => item.id === id);
  if (!material) return;

  material.prestado_cantidad = 0;
  material.prestado_fijo = false;
  material.prestado_fecha = "";
  material.ultima_actualizacion = new Date().toISOString().slice(0, 10);
  await persistAndRender(material, "devuelto");
}

function hasLoan(material) {
  return Number(material?.prestado_cantidad || 0) > 0;
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
  scrollToSectionOnMobile(els.materialsColumn);
}

function scrollToSectionOnMobile(target) {
  if (!target || !window.matchMedia("(max-width: 700px)").matches) return;

  scrollToSection(target);
}

function scrollToSection(target) {
  if (!target) return;

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const quantity = item.cantidad_comprobada ? `${formatQuantity(item.cantidad)} ${formatTotalUnit(item.unidad)}`.trim() : "Stock correcto";
  const lines = [
    `- ${item.codigo || "Sin código"} - ${item.nombre || "Sin nombre"}`,
    `  Cantidad: ${quantity}`,
    `  Estado: ${orderState}`
  ];

  if (item.observaciones) {
    lines.push(`  ${formatObservationLine(item.observaciones)}`);
  }

  return lines.join("\n");
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
  const header = ["codigo", "nombre", "tipo_material", "estanteria", "seccion", "cantidad", "cantidad_comprobada", "unidad", "estado_stock", "pedido_hecho", "prestado_cantidad", "prestado_fijo", "prestado_fecha", "ubicacion", "observaciones", "ultima_actualizacion"];
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

async function persistAndRender(remotePayload = state.materials, action = "actualizar") {
  if (!requireCurrentUser()) return false;

  const materialsToSync = Array.isArray(remotePayload) ? remotePayload : [remotePayload];
  stampMaterialsForChange(materialsToSync);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.materials));
  markLastUpdate();
  resetUserSessionTimer();
  remote.hasPendingLocalChanges = remote.enabled;
  render();
  const saved = await saveRemoteMaterials(materialsToSync);
  if (saved) await recordRemoteChanges(materialsToSync, action);
  return saved;
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

function getTypes() {
  return [...new Set(state.materials.map((item) => item.tipo_material || "Sin tipo"))]
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
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
