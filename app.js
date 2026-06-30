// Router muy simple por hash: "#/" = vista general, "#/salon/<id>" = detalle.

let vistaActual = "overview"; // "overview" | id de salón
let intervaloRapido = null;
let intervaloLento = null;
let acumCacheSimulados = {}; // { salonId: { dispId: kWh } }, recalculado cada 30s

// Filtros de la vista general: se mantienen entre refrescos del intervalo.
let filtroNombre = "";
let filtroPiso = "todos";
let ordenSalones = "piso"; // "piso" | "gasto-actual" | "gasto-hoy"

function limpiarIntervalos() {
  clearInterval(intervaloRapido);
  clearInterval(intervaloLento);
  intervaloRapido = null;
  intervaloLento = null;
}

function recalcularAcumuladosSimulados() {
  SALONES.forEach(s => {
    if (s.tipo === "simulado") acumCacheSimulados[s.id] = energiaAcumuladaHoy(s);
  });
}

// Cada item lleva, además del total en la unidad natural del salón (mW/mWh para el real,
// W/kWh para los simulados), una versión normalizada a W/kWh ("potenciaW"/"energiaKWh") para
// poder sumar entre salones de distinta escala sin mezclar unidades en los totales de la facultad.
function construirItemOverview(salon, ahora) {
  if (salon.tipo === "real") {
    const encendidos = estadoReal.dispositivos.filter(d => d.encendido).length;
    const totalPotencia = estadoReal.dispositivos.reduce((a, d) => a + d.potencia, 0);
    const totalAcumulado = estadoReal.dispositivos.reduce((a, d) => a + d.acumulado, 0);
    return {
      salon,
      totalPotencia,
      totalAcumulado,
      potenciaW: totalPotencia / 1000,
      energiaKWh: totalAcumulado / 1000000,
      encendidos,
      activo: estadoReal.conectado && encendidos > 0,
      estadoTexto: estadoReal.conectado ? estadoReal.mensaje : "Sin conectar al medidor",
    };
  }

  const lecturas = generarLecturasSalon(salon, ahora);
  const acumPorId = acumCacheSimulados[salon.id] || {};
  const totalAcumulado = Object.values(acumPorId).reduce((a, v) => a + v, 0);
  const totalPotencia = lecturas.reduce((a, l) => a + l.potencia, 0);
  const encendidos = lecturas.filter(l => l.encendido).length;
  return {
    salon,
    totalPotencia,
    totalAcumulado,
    potenciaW: totalPotencia,
    energiaKWh: totalAcumulado,
    encendidos,
    activo: encendidos > 0,
    estadoTexto: claseActiva(salon.id, ahora) ? "En clase" : "Libre",
  };
}

function actualizarOverview() {
  const ahora = new Date();
  const items = SALONES.map(s => construirItemOverview(s, ahora));
  renderOverview(items, { nombre: filtroNombre, piso: filtroPiso, orden: ordenSalones });
}

function inicializarFiltros() {
  const selectPiso = document.getElementById("filtro-piso");
  PISOS.forEach(p => {
    const opt = document.createElement("option");
    opt.value = String(p.numero);
    opt.textContent = `Piso ${p.numero} · ${p.nombre}`;
    selectPiso.appendChild(opt);
  });

  document.getElementById("filtro-nombre").addEventListener("input", (e) => {
    filtroNombre = e.target.value.trim();
    if (vistaActual === "overview") actualizarOverview();
  });
  selectPiso.addEventListener("change", (e) => {
    filtroPiso = e.target.value;
    if (vistaActual === "overview") actualizarOverview();
  });
  document.getElementById("filtro-orden").addEventListener("change", (e) => {
    ordenSalones = e.target.value;
    if (vistaActual === "overview") actualizarOverview();
  });
}

function mostrarOverview() {
  vistaActual = "overview";
  document.getElementById("vista-salon").style.display = "none";
  document.getElementById("vista-overview").style.display = "block";
  document.getElementById("titulo-principal").textContent = "Monitoreo energético — Facultad";
  document.getElementById("subtitulo").textContent = "Vista general de todos los salones";

  recalcularAcumuladosSimulados();
  actualizarOverview();
  intervaloRapido = setInterval(actualizarOverview, 1500);
  intervaloLento = setInterval(recalcularAcumuladosSimulados, 30000);
}

function mostrarSalon(id) {
  const salon = SALONES.find(s => s.id === id);
  if (!salon) { location.hash = "#/"; return; }

  vistaActual = salon.id;
  document.getElementById("vista-overview").style.display = "none";
  document.getElementById("vista-salon").style.display = "block";
  document.getElementById("titulo-principal").textContent = salon.nombre;
  document.getElementById("subtitulo").textContent = salon.tipo === "real" ? "Medidor real (cable serial)" : "Simulación en vivo";

  const blockConectar = document.getElementById("bloque-conectar");

  if (salon.tipo === "real") {
    blockConectar.style.display = "block";
    renderDetalle(salon, estadoReal.dispositivos, accObjReal(), estadoReal.ultimaHora);
    document.getElementById("estado-conexion").textContent = estadoReal.mensaje;
    intervaloRapido = setInterval(() => {
      renderDetalle(salon, estadoReal.dispositivos, accObjReal(), estadoReal.ultimaHora);
      document.getElementById("estado-conexion").textContent = estadoReal.mensaje;
    }, 1000);
  } else {
    blockConectar.style.display = "none";
    let acumulado = energiaAcumuladaHoy(salon);
    const tick = () => {
      const lecturas = generarLecturasSalon(salon);
      renderDetalle(salon, lecturas, acumulado, new Date().toLocaleTimeString());
    };
    tick();
    intervaloRapido = setInterval(tick, 1500);
    intervaloLento = setInterval(() => { acumulado = energiaAcumuladaHoy(salon); }, 30000);
  }
}

function accObjReal() {
  const acc = {};
  estadoReal.dispositivos.forEach(d => { acc[d.id] = d.acumulado; });
  return acc;
}

// Llamado por real.js cada vez que llega o cambia un dato del medidor real,
// para refrescar la vista actual sin esperar al próximo tick del intervalo.
function onLecturaReal() {
  if (vistaActual === "overview") actualizarOverview();
  else if (vistaActual === "real") {
    renderDetalle(SALON_REAL, estadoReal.dispositivos, accObjReal(), estadoReal.ultimaHora);
    document.getElementById("estado-conexion").textContent = estadoReal.mensaje;
  }
}

function route() {
  limpiarIntervalos();
  const m = location.hash.match(/^#\/salon\/(.+)$/);
  if (m) mostrarSalon(decodeURIComponent(m[1]));
  else mostrarOverview();
}

window.addEventListener("hashchange", route);
document.getElementById("btn-conectar").addEventListener("click", conectarSalonReal);
inicializarFiltros();
route();
