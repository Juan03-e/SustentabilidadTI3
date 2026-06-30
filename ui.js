const TIPS = {
  estado: "Encendido = el dispositivo está consumiendo energía ahora mismo. Apagado = no está gastando nada en este momento.",
  potencia: "Qué tan fuerte está consumiendo el dispositivo ahora mismo, comparado con su uso normal. No es lo mismo que la energía total gastada en el día.",
  acumulado: "Toda la energía que gastó el dispositivo desde las 00:00 de hoy. Es lo que más importa para pensar en ahorro: cuánto se gastó en total, no qué tan rápido se gasta en este instante."
};

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function esReal(salon) { return salon.tipo === "real"; }

// El salón real reporta a escala de prototipo (mW); los simulados, a escala de
// edificio real (W/kWh). Estas funciones eligen el catálogo y las unidades según
// corresponda, para no mezclar ambas escalas en ningún cálculo ni texto.
function unidadPotencia(salon) { return esReal(salon) ? "mW" : "W"; }
function unidadCorriente(salon) { return esReal(salon) ? "mA" : "A"; }
function unidadEnergia(salon) { return esReal(salon) ? "mWh" : "kWh"; }
function formatPotencia(salon, v) { return esReal(salon) ? v.toFixed(1) : v.toFixed(0); }
function formatEnergia(salon, v) { return esReal(salon) ? v.toFixed(2) : v.toFixed(3); }

function nivelPorRatio(ratio, encendido) {
  if (!encendido) return { texto: "Sin consumo", clase: "nivel-apagado" };
  if (ratio < 0.4) return { texto: "Consumo bajo", clase: "nivel-bajo" };
  if (ratio < 0.75) return { texto: "Consumo medio", clase: "nivel-medio" };
  return { texto: "Consumo alto", clase: "nivel-alto" };
}

function nivelEnergiaPorRatio(ratio) {
  if (ratio < 0.15) return { texto: "Poca energía hoy", clase: "nivel-bajo" };
  if (ratio < 0.45) return { texto: "Energía moderada hoy", clase: "nivel-medio" };
  return { texto: "Mucha energía hoy", clase: "nivel-alto" };
}

// Nivel de consumo instantáneo de un dispositivo, relativo a su propio rango normal de uso
// (catálogo realista en W para simulados, catálogo de prototipo en mW para el salón real).
function nivelDispositivoAhora(salon, s) {
  const rango = esReal(salon) ? RANGO_REAL_MW[s.tipo] : DEVICE_TYPES[s.tipo];
  const ratio = clamp((s.potencia - rango.min) / (rango.max - rango.min), 0, 1);
  return nivelPorRatio(ratio, s.encendido);
}

// Nivel de energía acumulada hoy de un dispositivo, contra una referencia de "uso alto"
// (su potencia máxima sostenida 6 horas, una jornada activa típica).
function nivelDispositivoHoy(salon, tipo, acumulado) {
  const rango = esReal(salon) ? RANGO_REAL_MW[tipo] : DEVICE_TYPES[tipo];
  const referencia = esReal(salon) ? rango.max * 6 : (rango.max * 6) / 1000;
  return nivelEnergiaPorRatio(clamp(acumulado / referencia, 0, 1));
}

// Mismas clasificaciones para el total de un salón completo.
function nivelSalonAhora(salon, potenciaTotal) {
  const catalogo = esReal(salon) ? RANGO_REAL_MW : DEVICE_TYPES;
  const maxGrupo = salon.dispositivos.reduce((a, d) => a + catalogo[d.tipo].max, 0);
  const ratio = clamp(potenciaTotal / maxGrupo, 0, 1);
  return nivelPorRatio(ratio, potenciaTotal > 0);
}

function nivelSalonHoy(salon, acumuladoTotal) {
  const catalogo = esReal(salon) ? RANGO_REAL_MW : DEVICE_TYPES;
  const divisor = esReal(salon) ? 1 : 1000;
  const referencia = salon.dispositivos.reduce((a, d) => a + catalogo[d.tipo].max * 6, 0) / divisor;
  return nivelEnergiaPorRatio(clamp(acumuladoTotal / referencia, 0, 1));
}

// Nivel para agregados de varios salones (un piso o la facultad entera). Estos ya vienen
// normalizados a W/kWh, así que siempre se comparan contra el catálogo realista (DEVICE_TYPES).
function nivelEdificioAhora(dispositivosConfig, potenciaW) {
  const maxGrupo = dispositivosConfig.reduce((a, d) => a + DEVICE_TYPES[d.tipo].max, 0);
  const ratio = clamp(potenciaW / maxGrupo, 0, 1);
  return nivelPorRatio(ratio, potenciaW > 0);
}

function nivelEdificioHoy(dispositivosConfig, energiaKWh) {
  const referenciaKWh = dispositivosConfig.reduce((a, d) => a + DEVICE_TYPES[d.tipo].max * 6, 0) / 1000;
  return nivelEnergiaPorRatio(clamp(energiaKWh / referenciaKWh, 0, 1));
}

// ---------- Tooltips (compartido por ambas vistas) ----------

const tooltip = document.getElementById("tooltip");
let tipActivo = null;

function posicionarTip(target) {
  const r = target.getBoundingClientRect();
  const tr = tooltip.getBoundingClientRect();
  let left = r.left + r.width / 2 - tr.width / 2;
  let top = r.top - tr.height - 10;
  if (top < 8) top = r.bottom + 10;
  if (left < 8) left = 8;
  if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
  tooltip.style.left = left + "px";
  tooltip.style.top = top + "px";
}

document.addEventListener("mouseover", (e) => {
  const target = e.target.closest("[data-tip]");
  if (!target) return;
  const tip = target.getAttribute("data-tip");
  if (target === tipActivo) return;
  tipActivo = target;
  tooltip.textContent = tip;
  tooltip.classList.add("visible");
  posicionarTip(target);
});

document.addEventListener("mouseout", (e) => {
  const target = e.target.closest("[data-tip]");
  if (!target) return;
  const rel = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest("[data-tip]");
  if (rel === target) return;
  if (rel && target.contains(rel)) return;
  tipActivo = null;
  tooltip.classList.remove("visible");
});

// ---------- Toggle de detalle técnico (oculto por defecto) ----------

const toggleTecnico = document.getElementById("toggle-tecnico");
toggleTecnico.addEventListener("change", (e) => {
  document.body.classList.toggle("tecnico-visible", e.target.checked);
});

// ---------- Vista detalle de un salón ----------

function renderDetalle(salon, dispositivos, acumuladoPorId, ultimaHora) {
  const uP = unidadPotencia(salon), uA = unidadCorriente(salon), uE = unidadEnergia(salon);

  document.getElementById("cards").innerHTML = dispositivos.map(s => {
    const acumulado = acumuladoPorId[s.id] || 0;
    const nivelAhora = nivelDispositivoAhora(salon, s);
    const nivelHoy = nivelDispositivoHoy(salon, s.tipo, acumulado);
    return `
    <div class="card">
      <h2><span class="dot" style="background:${s.color}"></span>${s.nombre} <span class="estado ${s.encendido ? 'on' : 'off'}" data-tip="${TIPS.estado}">${s.encendido ? 'Encendido' : 'Apagado'}</span></h2>
      <div class="nivel nivel-grande ${nivelAhora.clase}" data-tip="${TIPS.potencia}">${nivelAhora.texto}</div>
      <div class="tech-line lbl">${formatPotencia(salon, s.potencia)} <span class="unit">${uP}</span> · ${s.corriente.toFixed(2)} <span class="unit">${uA}</span></div>
      <div class="acum">
        <div class="lbl" data-tip="${TIPS.acumulado}">Energía usada hoy</div>
        <div class="nivel ${nivelHoy.clase}" style="margin-top:6px" data-tip="${TIPS.acumulado}">${nivelHoy.texto}</div>
        <div class="tech-line lbl">${formatEnergia(salon, acumulado)} <span class="unit">${uE}</span></div>
      </div>
    </div>`;
  }).join("");

  const total = dispositivos.reduce((a, s) => a + s.potencia, 0);
  const nivelTotalAhora = nivelSalonAhora(salon, total);
  document.getElementById("total").innerHTML = `<span class="nivel nivel-grande ${nivelTotalAhora.clase}">${nivelTotalAhora.texto}</span>`;
  document.getElementById("total-tech").innerHTML = formatPotencia(salon, total) + ` <span class="unit">${uP}</span>`;

  const acumTotal = dispositivos.reduce((a, s) => a + (acumuladoPorId[s.id] || 0), 0);
  const nivelTotalHoy = nivelSalonHoy(salon, acumTotal);
  document.getElementById("acum-total").innerHTML = `<span class="nivel nivel-grande ${nivelTotalHoy.clase}">${nivelTotalHoy.texto}</span>`;
  document.getElementById("acum-total-tech").innerHTML = formatEnergia(salon, acumTotal) + ` <span class="unit">${uE}</span>`;

  document.getElementById("encendidos").textContent = dispositivos.filter(s => s.encendido).length + " / " + dispositivos.length;

  const maxP = Math.max(...dispositivos.map(s => s.potencia), 1);
  document.getElementById("barras").innerHTML = dispositivos.map(s => {
    const nivel = nivelDispositivoAhora(salon, s);
    return `
    <div class="barras-fila">
      <div class="barras-lbl">${s.nombre}</div>
      <div class="barras-bg"><div class="barra" style="width:${(s.potencia / maxP * 100).toFixed(0)}%;background:${s.color}"></div></div>
      <div class="barras-val">${nivel.texto} <span class="tech">(${formatPotencia(salon, s.potencia)} ${uP})</span></div>
    </div>`;
  }).join("");

  document.getElementById("hora").textContent = ultimaHora || "—";
}

// ---------- Vista general de la facultad ----------

function normalizar(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tarjetaSalonHtml(it, rank) {
  const nivelAhora = nivelSalonAhora(it.salon, it.totalPotencia);
  const nivelHoy = nivelSalonHoy(it.salon, it.totalAcumulado);
  const uP = unidadPotencia(it.salon), uE = unidadEnergia(it.salon);
  const piso = PISOS.find(p => p.numero === it.salon.piso);
  return `
    <a class="salon-card" href="#/salon/${it.salon.id}">
      <div class="salon-card-top">
        <span class="badge ${it.salon.tipo === 'real' ? 'badge-real' : 'badge-sim'}">${it.salon.tipo === 'real' ? 'Medidor real' : 'Simulado'}</span>
        <span class="punto ${it.activo ? 'punto-on' : 'punto-off'}" title="${it.activo ? 'Con consumo' : 'Sin consumo'}"></span>
      </div>
      <h3>${rank ? `<span class="rank">${rank}</span>` : ""}${it.salon.nombre}</h3>
      <div class="salon-card-estado">${it.estadoTexto} · <span class="piso-tag">Piso ${it.salon.piso}${piso ? " · " + piso.nombre : ""}</span></div>
      <div class="salon-card-stats">
        <div><span class="nivel ${nivelAhora.clase}">${nivelAhora.texto}</span> <span class="tech lbl">(${formatPotencia(it.salon, it.totalPotencia)} ${uP})</span></div>
        <div><span class="nivel ${nivelHoy.clase}">${nivelHoy.texto}</span> <span class="tech lbl">(${formatEnergia(it.salon, it.totalAcumulado)} ${uE})</span></div>
        <div><span class="num">${it.encendidos}/${it.salon.dispositivos.length}</span><span class="lbl"> encendidos</span></div>
      </div>
    </a>`;
}

function renderOverview(items, filtros = { nombre: "", piso: "todos", orden: "piso" }) {
  // Los totales de la facultad siempre reflejan TODOS los salones, sin importar el filtro activo.
  const totalFacultadW = items.reduce((a, it) => a + it.potenciaW, 0);
  const acumFacultadKWh = items.reduce((a, it) => a + it.energiaKWh, 0);
  const salonesActivos = items.filter(it => it.activo).length;
  const todosDispositivos = SALONES.flatMap(s => s.dispositivos);

  const nivelFacultadAhora = nivelEdificioAhora(todosDispositivos, totalFacultadW);
  document.getElementById("facultad-total").innerHTML = `<span class="nivel nivel-grande ${nivelFacultadAhora.clase}">${nivelFacultadAhora.texto}</span>`;
  document.getElementById("facultad-total-tech").innerHTML = totalFacultadW.toFixed(0) + ' <span class="unit">W</span>';

  const nivelFacultadHoy = nivelEdificioHoy(todosDispositivos, acumFacultadKWh);
  document.getElementById("facultad-acum").innerHTML = `<span class="nivel nivel-grande ${nivelFacultadHoy.clase}">${nivelFacultadHoy.texto}</span>`;
  document.getElementById("facultad-acum-tech").innerHTML = acumFacultadKWh.toFixed(2) + ' <span class="unit">kWh</span>';

  document.getElementById("facultad-activos").textContent = salonesActivos + " / " + items.length;

  // El filtro de piso/nombre sí se aplica a la grilla de salones de abajo.
  const nombreBuscado = normalizar(filtros.nombre || "");
  const filtrados = items.filter(it => {
    if (filtros.piso !== "todos" && it.salon.piso !== Number(filtros.piso)) return false;
    if (nombreBuscado && !normalizar(it.salon.nombre).includes(nombreBuscado)) return false;
    return true;
  });

  if (filtrados.length === 0) {
    document.getElementById("pisos").innerHTML = '<div class="sin-resultados">No hay salones que coincidan con la búsqueda.</div>';
    return;
  }

  if (filtros.orden === "gasto-actual" || filtros.orden === "gasto-hoy") {
    const ordenados = [...filtrados].sort((a, b) =>
      filtros.orden === "gasto-actual" ? b.potenciaW - a.potenciaW : b.energiaKWh - a.energiaKWh
    );
    document.getElementById("pisos").innerHTML =
      `<div class="grid-salones">${ordenados.map((it, i) => tarjetaSalonHtml(it, i + 1)).join("")}</div>`;
    return;
  }

  document.getElementById("pisos").innerHTML = PISOS.map(piso => {
    const itemsPiso = filtrados.filter(it => it.salon.piso === piso.numero);
    if (itemsPiso.length === 0) return "";
    const totalPisoW = itemsPiso.reduce((a, it) => a + it.potenciaW, 0);
    const activosPiso = itemsPiso.filter(it => it.activo).length;
    const nivelPiso = nivelEdificioAhora(itemsPiso.flatMap(it => it.salon.dispositivos), totalPisoW);
    return `
      <div class="piso-seccion">
        <div class="piso-header">
          <h2>Piso ${piso.numero} <span class="lbl">· ${piso.nombre}</span></h2>
          <div class="piso-stats">${nivelPiso.texto.toLowerCase()} ahora <span class="tech">(${totalPisoW.toFixed(0)} W)</span> · ${activosPiso}/${itemsPiso.length} salones con consumo</div>
        </div>
        <div class="grid-salones">${itemsPiso.map(it => tarjetaSalonHtml(it)).join("")}</div>
      </div>`;
  }).join("");
}
