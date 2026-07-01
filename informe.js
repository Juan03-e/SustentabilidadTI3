// Genera un informe en PDF (con jsPDF, cargado por CDN) a partir del mismo histórico
// simulado y las mismas conclusiones que se ven en la vista de Análisis. Reutiliza las
// imágenes de los gráficos ya renderizados (Chart.js expone toBase64Image()).

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const PDF_COLORES = {
  accent: hexToRgb("#7c6fd8"),
  texto: hexToRgb("#332e27"),
  textoSuave: hexToRgb("#8f8576"),
  borde: hexToRgb("#ece4d6"),
  fondoSuave: hexToRgb("#faf7f2"),
  alerta: hexToRgb("#c0463a"),
  positivo: hexToRgb("#4b8f4f"),
  info: hexToRgb("#b8862c"),
};

const GRAFICOS_INFORME = [
  { id: "grafico-diario", titulo: "Consumo diario de la facultad" },
  { id: "grafico-horario", titulo: "Patrón horario promedio" },
  { id: "grafico-tipo", titulo: "Consumo por tipo de equipo" },
  { id: "grafico-piso", titulo: "Consumo por piso" },
  { id: "grafico-ranking", titulo: "Ranking de salones" },
];

function generarInformePDF(dias) {
  if (typeof window.jspdf === "undefined") {
    alert("No se pudo cargar el generador de PDF. Verificá tu conexión a internet e intentá de nuevo.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const anchoPagina = 210;
  const altoPagina = 297;
  const margen = 16;
  const anchoContenido = anchoPagina - margen * 2;
  const ahora = new Date();

  const resumen = resumenPeriodo(dias);
  const patronHorario = patronHorarioPromedio(dias);
  const conclusiones = generarConclusiones(resumen, patronHorario);

  // ---------- Encabezado ----------
  doc.setFillColor(...PDF_COLORES.accent);
  doc.rect(0, 0, anchoPagina, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Informe de consumo energético", margen, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Facultad — Monitoreo energético · Últimos ${dias} días`, margen, 27);
  doc.setFontSize(9);
  doc.text(`Generado el ${ahora.toLocaleDateString("es-UY")} a las ${ahora.toLocaleTimeString("es-UY")} · Datos simulados`, margen, 34);

  let y = 50;

  // ---------- Resumen numérico ----------
  const totalPeriodo = resumen.porDia.reduce((a, d) => a + d.kWh, 0);
  const diasConDatos = resumen.porDia.filter(d => d.kWh > 0).length;
  const promedioDiario = diasConDatos ? totalPeriodo / diasConDatos : 0;
  const salonMasAlto = resumen.porSalon[0];

  const stats = [
    { lbl: "Energía total del período", val: `${totalPeriodo.toFixed(1)} kWh` },
    { lbl: "Promedio diario (días con clase)", val: `${promedioDiario.toFixed(1)} kWh` },
    { lbl: "Salones simulados analizados", val: String(resumen.porSalon.length) },
    { lbl: "Salón de mayor consumo", val: salonMasAlto ? salonMasAlto.salon.nombre : "—" },
  ];

  doc.setTextColor(...PDF_COLORES.texto);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Resumen del período", margen, y);
  y += 8;

  const colAncho = (anchoContenido - 9) / 2;
  const filaAlto = 20;
  stats.forEach((s, i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = margen + col * (colAncho + 9);
    const yy = y + fila * (filaAlto + 6);
    doc.setDrawColor(...PDF_COLORES.borde);
    doc.setFillColor(...PDF_COLORES.fondoSuave);
    doc.roundedRect(x, yy, colAncho, filaAlto, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORES.textoSuave);
    doc.text(s.lbl, x + 5, yy + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...PDF_COLORES.texto);
    doc.text(s.val, x + 5, yy + 15);
  });

  y += 2 * (filaAlto + 6) + 4;

  // ---------- Conclusiones ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PDF_COLORES.texto);
  doc.text("Conclusiones", margen, y);
  y += 8;

  doc.setFontSize(10);
  conclusiones.forEach(c => {
    const color = PDF_COLORES[c.tipo] || PDF_COLORES.info;
    const lineas = doc.splitTextToSize(c.texto, anchoContenido - 8);
    const altoBloque = lineas.length * 5 + 6;
    if (y + altoBloque > altoPagina - 20) { doc.addPage(); y = margen; }
    doc.setFillColor(...color);
    doc.rect(margen, y, 1.5, altoBloque - 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_COLORES.texto);
    doc.text(lineas, margen + 6, y + 5);
    y += altoBloque;
  });

  // ---------- Gráficos ----------
  GRAFICOS_INFORME.forEach(g => {
    const chart = graficos[g.id];
    if (!chart) return;
    const imgAncho = anchoContenido;
    const imgAlto = imgAncho * 0.5;
    if (y + imgAlto + 14 > altoPagina - 16) { doc.addPage(); y = margen; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...PDF_COLORES.texto);
    doc.text(g.titulo, margen, y);
    y += 6;
    doc.addImage(chart.toBase64Image(), "PNG", margen, y, imgAncho, imgAlto);
    y += imgAlto + 12;
  });

  // ---------- Pie de página ----------
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLORES.borde);
    doc.line(margen, altoPagina - 14, anchoPagina - margen, altoPagina - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORES.textoSuave);
    doc.text("Monitoreo energético — Facultad · Datos simulados", margen, altoPagina - 9);
    doc.text(`Página ${p} de ${totalPaginas}`, anchoPagina - margen, altoPagina - 9, { align: "right" });
  }

  doc.save(`informe-consumo-facultad-${fechaHoy(ahora)}.pdf`);
}
