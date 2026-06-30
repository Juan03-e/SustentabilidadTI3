// Maneja el salón "real": conexión Web Serial al medidor y acumulado persistido
// en localStorage (a diferencia de los salones simulados, estos datos no son
// reproducibles, así que se guardan tal cual llegan).

const SALON_REAL = SALONES.find(s => s.id === "real");
const STORAGE_KEY_REAL = "consumo_diario_v2";

const estadoReal = {
  conectado: false,
  mensaje: "Sin conectar al medidor",
  ultimaHora: null,
  dispositivos: SALON_REAL.dispositivos.map(d => ({
    id: d.id,
    nombre: d.nombre,
    tipo: d.tipo,
    color: DEVICE_TYPES[d.tipo].color,
    corriente: 0,
    potencia: 0,
    encendido: false,
    acumulado: 0,
  })),
};

let ultimoTimestampMsReal = null;

function cargarAcumuladoReal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REAL);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.fecha !== fechaHoy()) return;
    estadoReal.dispositivos.forEach(d => { d.acumulado = data[d.id] || 0; });
  } catch (e) {}
}

function guardarAcumuladoReal() {
  const data = { fecha: fechaHoy() };
  estadoReal.dispositivos.forEach(d => { data[d.id] = d.acumulado; });
  localStorage.setItem(STORAGE_KEY_REAL, JSON.stringify(data));
}

function chequearReinicioDiarioReal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REAL);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.fecha !== fechaHoy()) {
      estadoReal.dispositivos.forEach(d => { d.acumulado = 0; });
      guardarAcumuladoReal();
    }
  } catch (e) {}
}

function procesarLineaReal(linea) {
  if (!linea || linea.startsWith("ms")) return;
  const partes = linea.split(",");
  if (partes.length !== 7) return;
  const v = partes.map(p => parseFloat(p));
  if (v.some(n => isNaN(n))) return;

  chequearReinicioDiarioReal();

  const [ts, iA, pA, iB, pB, iC, pC] = v;
  const lecturas = [iA, iB, iC];
  const potencias = [pA, pB, pC];

  if (ultimoTimestampMsReal !== null) {
    const deltaH = (ts - ultimoTimestampMsReal) / 1000 / 3600;
    if (deltaH > 0 && deltaH < 1) {
      estadoReal.dispositivos.forEach((d, i) => { d.acumulado += potencias[i] * deltaH; });
      guardarAcumuladoReal();
    }
  }
  ultimoTimestampMsReal = ts;

  estadoReal.dispositivos.forEach((d, i) => {
    d.corriente = lecturas[i];
    d.potencia = potencias[i];
    d.encendido = lecturas[i] > UMBRAL_MA;
  });
  estadoReal.ultimaHora = new Date().toLocaleTimeString();
  estadoReal.conectado = true;
  estadoReal.mensaje = "Recibiendo datos del medidor en vivo";

  if (typeof onLecturaReal === "function") onLecturaReal();
}

async function conectarSalonReal() {
  if (!("serial" in navigator)) {
    document.getElementById("sin-soporte").style.display = "block";
    return;
  }
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    estadoReal.conectado = true;
    estadoReal.mensaje = "Conectado, esperando primera lectura...";
    cargarAcumuladoReal();
    if (typeof onLecturaReal === "function") onLecturaReal();

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);
    const reader = decoder.readable.getReader();

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lineas = buffer.split("\n");
      buffer = lineas.pop();
      for (const linea of lineas) procesarLineaReal(linea.trim());
    }
  } catch (e) {
    estadoReal.mensaje = "Error: " + e.message;
    if (typeof onLecturaReal === "function") onLecturaReal();
  }
}

setInterval(chequearReinicioDiarioReal, 60000);

if (!("serial" in navigator)) {
  document.getElementById("sin-soporte").style.display = "block";
}
