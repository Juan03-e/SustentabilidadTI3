// El salón real llega por cable serial a escala de prototipo (sensor de bajo voltaje): mA y mW.
// Los salones simulados, en cambio, representan un edificio real a 220V: se generan y muestran
// en W y kWh, mucho más reconocibles para alguien que lee una factura de UTE.
const UMBRAL_MA = 0.5; // umbral de "encendido" del salón real (mA)
const UMBRAL_W = 5;    // umbral de "encendido" de los salones simulados (W)
const VOLTAGE_SIM = 220; // V nominal de la instalación eléctrica simulada

function fechaHoy(date = new Date()) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// Catálogo de tipos de dispositivo para los salones SIMULADOS: color y rango de potencia (W)
// realista de un edificio, cuando están encendidos.
const DEVICE_TYPES = {
  AC:   { nombre: "Aire acondicionado", color: "#ef8b7a", min: 900, max: 2200, ciclico: true },
  PROY: { nombre: "Proyector",          color: "#f4b860", min: 220, max: 350,  ciclico: false },
  LUZ:  { nombre: "Luces",              color: "#8bbf6f", min: 80,  max: 350,  ciclico: false },
  PC:   { nombre: "Computadoras",       color: "#6fa3d8", min: 600, max: 2400, ciclico: false },
  AUDIO:{ nombre: "Equipo de audio",    color: "#a98bd6", min: 40,  max: 180,  ciclico: false },
  CAFE: { nombre: "Cafetera",           color: "#bf9270", min: 700, max: 1500, ciclico: true },
};

// Rango de referencia (mW) del salón real, a la escala diminuta del sensor del prototipo.
// Se usa solo para clasificar su nivel de consumo en lenguaje simple; el dato en sí sigue
// llegando tal cual lo manda el medidor por cable serial.
const RANGO_REAL_MW = {
  AC:   { min: 100, max: 275 },
  PROY: { min: 50,  max: 125 },
  LUZ:  { min: 10,  max: 40  },
};

// Salones de la facultad. El primero ("real") recibe datos del medidor por cable serial;
// el resto se simula con un patrón de horario de clases (ver sim.js).
// Nombres de los pisos del edificio, en orden.
const PISOS = [
  { numero: 1, nombre: "Planta baja" },
  { numero: 2, nombre: "Primer piso" },
  { numero: 3, nombre: "Segundo piso" },
];

const SALONES = [
  {
    id: "real", nombre: "Salón de prueba (medidor real)", tipo: "real", piso: 1,
    dispositivos: [
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
      { id: "PROY", tipo: "PROY", nombre: "Proyector" },
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
    ],
  },
  {
    id: "101", nombre: "Salón 101", tipo: "simulado", piso: 1,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PROY", tipo: "PROY", nombre: "Proyector" },
    ],
  },
  {
    id: "102", nombre: "Salón 102", tipo: "simulado", piso: 1,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PROY", tipo: "PROY", nombre: "Proyector" },
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
    ],
  },
  {
    id: "103", nombre: "Salón 103", tipo: "simulado", piso: 1,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
    ],
  },
  {
    id: "lab1", nombre: "Laboratorio de Informática 1", tipo: "simulado", piso: 2,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PC", tipo: "PC", nombre: "Computadoras" },
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
    ],
  },
  {
    id: "lab2", nombre: "Laboratorio de Informática 2", tipo: "simulado", piso: 2,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PC", tipo: "PC", nombre: "Computadoras" },
    ],
  },
  {
    id: "biblioteca", nombre: "Biblioteca", tipo: "simulado", piso: 2,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PC", tipo: "PC", nombre: "Computadoras" },
    ],
  },
  {
    id: "auditorio", nombre: "Auditorio", tipo: "simulado", piso: 3,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PROY", tipo: "PROY", nombre: "Proyector" },
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
      { id: "AUDIO", tipo: "AUDIO", nombre: "Equipo de audio" },
    ],
  },
  {
    id: "sala-profesores", nombre: "Sala de profesores", tipo: "simulado", piso: 3,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
      { id: "CAFE", tipo: "CAFE", nombre: "Cafetera" },
    ],
  },
  {
    id: "sala-reuniones", nombre: "Sala de reuniones", tipo: "simulado", piso: 3,
    dispositivos: [
      { id: "LUZ", tipo: "LUZ", nombre: "Luces" },
      { id: "PROY", tipo: "PROY", nombre: "Proyector" },
      { id: "AC", tipo: "AC", nombre: "Aire acondicionado" },
    ],
  },
];
