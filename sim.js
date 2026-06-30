// Motor de simulación de los salones "simulados": genera lecturas determinísticas
// a partir de la hora real, siguiendo un patrón de bloques horarios de clase.
// Al ser una función pura del tiempo, da los mismos valores sin importar desde
// qué vista (overview o detalle) se consulte.

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const BLOQUES_CLASE = [
  { inicio: 8, fin: 10, prob: 0.75 },
  { inicio: 10, fin: 12, prob: 0.8 },
  { inicio: 12, fin: 14, prob: 0.35 },
  { inicio: 14, fin: 16, prob: 0.8 },
  { inicio: 16, fin: 18, prob: 0.75 },
  { inicio: 18, fin: 20, prob: 0.65 },
  { inicio: 20, fin: 22, prob: 0.5 },
];

function bloqueActual(date) {
  const hora = date.getHours() + date.getMinutes() / 60;
  for (let i = 0; i < BLOQUES_CLASE.length; i++) {
    if (hora >= BLOQUES_CLASE[i].inicio && hora < BLOQUES_CLASE[i].fin) return i;
  }
  return -1;
}

// Decide si hay clase en un salón durante el bloque horario actual. Es estable
// durante todo el bloque y cambia de un día a otro (no parpadea segundo a segundo).
// Los fines de semana la facultad no tiene clases: esto también le da forma a los
// gráficos históricos (caída de consumo los sábados y domingos).
function claseActiva(salonId, date) {
  const diaSemana = date.getDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) return false;
  const idx = bloqueActual(date);
  if (idx === -1) return false;
  const bloque = BLOQUES_CLASE[idx];
  const seed = salonId + "|" + fechaHoy(date) + "|" + idx;
  return hash01(seed) < bloque.prob;
}

// Ciclo de encendido/apagado tipo termostato (para AC/cafetera) con período en minutos.
function cicloOnOff(date, seed, periodoMin, duty) {
  const minutos = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const desfase = hash01(seed) * periodoMin;
  const fase = (minutos + desfase) % periodoMin;
  return fase < periodoMin * duty;
}

// Ruido suave y determinístico (sin estado) para que las lecturas no sean constantes.
function ruido(date, seed) {
  const t = date.getTime() / 1000;
  const off = hash01(seed) * 1000;
  return Math.sin((t + off) / 17) * 0.5 + Math.sin((t + off) / 41) * 0.3 + Math.sin((t + off) / 7) * 0.2;
}

function generarLecturaDispositivo(salonId, disp, date) {
  const rango = DEVICE_TYPES[disp.tipo];
  const enClase = claseActiva(salonId, date);
  let encendidoBase = false;
  if (enClase) {
    encendidoBase = rango.ciclico ? cicloOnOff(date, salonId + disp.id, 4, 0.55) : true;
  }

  // A diferencia del salón real (que recibe la potencia ya calculada del sensor),
  // acá se genera directamente en W -la escala de un edificio real a 220V- y de
  // ahí se deriva una corriente (A) solo de referencia para el detalle técnico.
  let potencia = 0;
  if (encendidoBase) {
    const base = (rango.min + rango.max) / 2;
    const amp = (rango.max - rango.min) / 2;
    potencia = base + amp * ruido(date, salonId + disp.id);
    potencia = Math.min(rango.max, Math.max(rango.min, potencia));
  }

  return {
    id: disp.id,
    nombre: disp.nombre,
    tipo: disp.tipo,
    color: rango.color,
    corriente: potencia / VOLTAGE_SIM,
    potencia,
    encendido: potencia > UMBRAL_W,
  };
}

function generarLecturasSalon(salon, date = new Date()) {
  return salon.dispositivos.map(d => generarLecturaDispositivo(salon.id, d, date));
}

// Integra la potencia simulada (W) de un salón entre dos instantes, en pasos de "pasoMin"
// minutos, y devuelve el total de energía en kWh por dispositivo (misma unidad que una
// factura de UTE). Es la base tanto del acumulado de "hoy" como del histórico de otros días.
function integrarEnergia(salon, inicio, fin, pasoMin) {
  const totales = {};
  salon.dispositivos.forEach(d => { totales[d.id] = 0; });
  for (let t = inicio.getTime(); t <= fin.getTime(); t += pasoMin * 60000) {
    const lecturas = generarLecturasSalon(salon, new Date(t));
    lecturas.forEach(l => { totales[l.id] += l.potencia * (pasoMin / 60) / 1000; });
  }
  return totales;
}

// Acumulado de energía (kWh por dispositivo) desde la medianoche local hasta "hasta".
function energiaAcumuladaHoy(salon, hasta = new Date()) {
  const inicio = new Date(hasta);
  inicio.setHours(0, 0, 0, 0);
  return integrarEnergia(salon, inicio, hasta, 2);
}
