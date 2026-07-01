// Renderizado de la página de Análisis con Chart.js, a partir del histórico
// simulado que calcula historial.js. Cada gráfico se destruye y se vuelve a
// crear al refrescar (Chart.js no permite reusar un canvas sin hacerlo).

let graficos = {}; // id de canvas -> instancia de Chart

const COLOR_GRAFICO_TEXTO = "#8f8576";
const COLOR_GRAFICO_GRILLA = "#ece4d6";
const COLOR_GRAFICO_ACCENT = "#7c6fd8";

if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
  Chart.defaults.color = COLOR_GRAFICO_TEXTO;
}

function crearGrafico(id, config) {
  if (graficos[id]) { graficos[id].destroy(); delete graficos[id]; }
  const ctx = document.getElementById(id);
  graficos[id] = new Chart(ctx, config);
}

function opcionesEjes(unidadY) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: COLOR_GRAFICO_GRILLA }, ticks: { color: COLOR_GRAFICO_TEXTO } },
      y: {
        grid: { color: COLOR_GRAFICO_GRILLA },
        ticks: { color: COLOR_GRAFICO_TEXTO },
        title: { display: true, text: unidadY, color: COLOR_GRAFICO_TEXTO },
        beginAtZero: true,
      },
    },
  };
}

function renderConclusiones(conclusiones) {
  document.getElementById("conclusiones").innerHTML = conclusiones
    .map(c => `<div class="conclusion-item conclusion-${c.tipo}">${c.texto}</div>`)
    .join("");
}

function renderAnalisis(dias) {
  const resumen = resumenPeriodo(dias);
  const patronHorario = patronHorarioPromedio(dias);
  renderConclusiones(generarConclusiones(resumen, patronHorario));

  crearGrafico("grafico-diario", {
    type: "line",
    data: {
      labels: resumen.porDia.map(d => d.etiqueta),
      datasets: [{
        label: "kWh por día",
        data: resumen.porDia.map(d => d.kWh),
        borderColor: COLOR_GRAFICO_ACCENT,
        backgroundColor: "rgba(124, 111, 216, 0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: opcionesEjes("kWh"),
  });

  crearGrafico("grafico-horario", {
    type: "line",
    data: {
      labels: patronHorario.map((_, h) => `${h}h`),
      datasets: [{
        label: "W promedio",
        data: patronHorario,
        borderColor: "#f4b860",
        backgroundColor: "rgba(244, 184, 96, 0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 0,
      }],
    },
    options: opcionesEjes("W"),
  });

  const tipos = Object.keys(resumen.porTipo);
  crearGrafico("grafico-tipo", {
    type: "doughnut",
    data: {
      labels: tipos.map(t => DEVICE_TYPES[t].nombre),
      datasets: [{
        data: tipos.map(t => resumen.porTipo[t]),
        backgroundColor: tipos.map(t => DEVICE_TYPES[t].color),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12, color: COLOR_GRAFICO_TEXTO } } },
    },
  });

  crearGrafico("grafico-piso", {
    type: "bar",
    data: {
      labels: PISOS.map(p => `Piso ${p.numero}`),
      datasets: [{
        label: "kWh",
        data: PISOS.map(p => resumen.porPiso[p.numero] || 0),
        backgroundColor: "#8bbf6f",
        borderRadius: 8,
      }],
    },
    options: opcionesEjes("kWh"),
  });

  crearGrafico("grafico-ranking", {
    type: "bar",
    data: {
      labels: resumen.porSalon.map(s => s.salon.nombre),
      datasets: [{
        label: "kWh",
        data: resumen.porSalon.map(s => s.kWh),
        backgroundColor: "#6fa3d8",
        borderRadius: 8,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: COLOR_GRAFICO_GRILLA },
          ticks: { color: COLOR_GRAFICO_TEXTO },
          title: { display: true, text: "kWh", color: COLOR_GRAFICO_TEXTO },
          beginAtZero: true,
        },
        y: { grid: { display: false }, ticks: { color: COLOR_GRAFICO_TEXTO } },
      },
    },
  });
}
