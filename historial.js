// Histórico simulado: reutiliza el mismo motor determinístico de sim.js para reconstruir
// el consumo de días pasados (no hace falta ir guardando snapshots: el patrón de cada
// salón ya depende de la fecha, así que "hoy hace 10 días" se puede recalcular en el momento).
// Solo cubre los salones SIMULADOS: el real no tiene histórico, solo la lectura en vivo.

const DIAS_SEMANA_ABR = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function etiquetaFecha(fecha) {
  return `${DIAS_SEMANA_ABR[fecha.getDay()]} ${fecha.getDate()}/${fecha.getMonth() + 1}`;
}

// Energía (kWh por dispositivo) de un salón en un día completo. Si la fecha es hoy, corta
// en el instante actual en vez de seguir hasta las 23:59 (no se puede simular el futuro).
function energiaDelDia(salon, fecha, pasoMin = 5) {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  let fin = new Date(fecha);
  fin.setHours(23, 59, 59, 999);
  const ahora = new Date();
  if (fin > ahora) fin = ahora;
  if (fin < inicio) return null;
  return integrarEnergia(salon, inicio, fin, pasoMin);
}

// Resumen agregado de los últimos "dias" días (incluye hoy, parcial) para todos los
// salones simulados: total por día, por piso, por tipo de dispositivo y por salón.
function resumenPeriodo(dias) {
  const salonesSimulados = SALONES.filter(s => s.tipo === "simulado");
  const hoy = new Date();
  const porDia = [];
  const porPiso = {};
  const porTipo = {};
  const porSalonMap = new Map(salonesSimulados.map(s => [s.id, 0]));

  for (let d = dias - 1; d >= 0; d--) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - d);
    let totalDia = 0;

    salonesSimulados.forEach(salon => {
      const totales = energiaDelDia(salon, fecha);
      if (!totales) return;
      let totalSalon = 0;
      salon.dispositivos.forEach(disp => {
        const kwh = totales[disp.id] || 0;
        totalSalon += kwh;
        porTipo[disp.tipo] = (porTipo[disp.tipo] || 0) + kwh;
      });
      totalDia += totalSalon;
      porPiso[salon.piso] = (porPiso[salon.piso] || 0) + totalSalon;
      porSalonMap.set(salon.id, porSalonMap.get(salon.id) + totalSalon);
    });

    porDia.push({ fecha, etiqueta: etiquetaFecha(fecha), kWh: totalDia });
  }

  const porSalon = salonesSimulados
    .map(s => ({ salon: s, kWh: porSalonMap.get(s.id) }))
    .sort((a, b) => b.kWh - a.kWh);

  return { porDia, porPiso, porTipo, porSalon };
}

// Potencia (W) promedio por hora del día, agregando todos los salones simulados, muestreada
// cada 30 minutos a lo largo de "dias" días. Sirve para ver en qué franjas se consume más.
function patronHorarioPromedio(dias) {
  const salonesSimulados = SALONES.filter(s => s.tipo === "simulado");
  const hoy = new Date();
  const sumaPorHora = new Array(24).fill(0);
  const muestrasPorHora = new Array(24).fill(0);

  for (let d = 0; d < dias; d++) {
    const fecha = new Date(hoy);
    fecha.setDate(fecha.getDate() - d);
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const t = new Date(fecha);
        t.setHours(h, m, 0, 0);
        if (t > hoy) continue;
        let potenciaTotal = 0;
        salonesSimulados.forEach(s => {
          potenciaTotal += generarLecturasSalon(s, t).reduce((a, l) => a + l.potencia, 0);
        });
        sumaPorHora[h] += potenciaTotal;
        muestrasPorHora[h]++;
      }
    }
  }

  return sumaPorHora.map((suma, h) => (muestrasPorHora[h] ? suma / muestrasPorHora[h] : 0));
}

// Lee un resumenPeriodo() + patronHorarioPromedio() y arma una lista de conclusiones en
// lenguaje simple ("tal equipo gasta mucho", "tal salón está por encima de la media"...)
// para que alguien sin formación técnica entienda dónde conviene enfocar el ahorro.
function generarConclusiones(resumen, patronHorario) {
  const conclusiones = [];
  const totalGeneral = Object.values(resumen.porTipo).reduce((a, v) => a + v, 0);

  // Tipo de equipo que más pesa en el consumo total.
  if (totalGeneral > 0) {
    const [tipoTop, kwhTop] = Object.entries(resumen.porTipo).sort((a, b) => b[1] - a[1])[0];
    const pctTop = (kwhTop / totalGeneral) * 100;
    if (pctTop >= 25) {
      conclusiones.push({
        tipo: "alerta",
        texto: `${DEVICE_TYPES[tipoTop].nombre} concentra el ${pctTop.toFixed(0)}% del consumo total del período: es el equipo donde más conviene buscar ahorro.`,
      });
    }
  }

  if (resumen.porSalon.length > 0) {
    const promedioSalon = resumen.porSalon.reduce((a, s) => a + s.kWh, 0) / resumen.porSalon.length;

    // Salones que consumieron bastante más que el promedio de los simulados.
    if (promedioSalon > 0) {
      resumen.porSalon
        .filter(s => s.kWh > promedioSalon * 1.3)
        .slice(0, 2)
        .forEach(s => {
          const pctSobre = (s.kWh / promedioSalon - 1) * 100;
          conclusiones.push({
            tipo: "alerta",
            texto: `${s.salon.nombre} consumió ${pctSobre.toFixed(0)}% más que el promedio de los salones simulados (${s.kWh.toFixed(1)} kWh vs ${promedioSalon.toFixed(1)} kWh de promedio).`,
          });
        });
    }

    // El salón más eficiente, si se destaca claramente del resto.
    const masEficiente = resumen.porSalon[resumen.porSalon.length - 1];
    if (promedioSalon > 0 && masEficiente.kWh < promedioSalon * 0.6) {
      conclusiones.push({
        tipo: "positivo",
        texto: `${masEficiente.salon.nombre} fue el que menos consumió del período (${masEficiente.kWh.toFixed(1)} kWh), bien por debajo del promedio: puede servir de referencia para los demás.`,
      });
    }
  }

  // Piso que más pesa en el total de la facultad.
  const pisosOrdenados = Object.entries(resumen.porPiso).sort((a, b) => b[1] - a[1]);
  if (pisosOrdenados.length > 0 && totalGeneral > 0) {
    const [pisoTop, kwhPisoTop] = pisosOrdenados[0];
    const nombrePiso = PISOS.find(p => p.numero === Number(pisoTop));
    const pctPiso = (kwhPisoTop / totalGeneral) * 100;
    conclusiones.push({
      tipo: "info",
      texto: `El Piso ${pisoTop}${nombrePiso ? " (" + nombrePiso.nombre + ")" : ""} concentra el ${pctPiso.toFixed(0)}% del consumo total de la facultad en este período.`,
    });
  }

  // Franja horaria de mayor demanda.
  const maxHora = patronHorario.indexOf(Math.max(...patronHorario));
  if (patronHorario[maxHora] > 0) {
    conclusiones.push({
      tipo: "info",
      texto: `El momento de mayor demanda es entre las ${maxHora}:00 y las ${maxHora + 1}:00, con un promedio de ${patronHorario[maxHora].toFixed(0)} W para toda la facultad.`,
    });
  }

  if (conclusiones.length === 0) {
    conclusiones.push({ tipo: "info", texto: "Todavía no hay suficiente consumo registrado en este período para sacar conclusiones." });
  }

  return conclusiones;
}
