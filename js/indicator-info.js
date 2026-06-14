// Human-readable descriptions for the active indicator help tooltip.

const INFO = {
  es: {
    workers: 'Personas ocupadas en actividades agrarias. En el visor se asignan por país, año y categoría productiva para reconstruir el trabajo agrario total.',
    hours_total: 'Horas anuales de trabajo agrario. Multiplica personas trabajadoras por intensidad anual de trabajo y permite comparar la magnitud total del trabajo movilizado.',
    hours_per_worker: 'Horas anuales por trabajador agrario. Resume la intensidad media de trabajo por persona ocupada en el sector agrario.',
    area_harvested: 'Superficie cosechada asociada a los productos agrarios. Se expresa en hectáreas y se usa como base de algunas medidas de productividad.',
    livestock_units: 'Unidades ganaderas comparables entre especies. Permiten expresar la escala física del ganado con una unidad funcional común.',
    production_tonnes: 'Producción agraria en toneladas. Es la producción física asociada a cada país, año y categoría de producto.',
    h_per_functional_unit: 'Trabajo necesario por unidad funcional. La unidad puede leerse como tonelada de producto, hectárea cosechada o unidad ganadera; en productividad puedes invertirla para ver unidad funcional por hora.',
    h_per_ha: 'Horas de trabajo por hectárea cosechada. Mide la intensidad laboral de la tierra: cuántas horas requiere producir sobre una hectárea.',
    h_per_tonne: 'Horas de trabajo por tonelada producida. Mide la huella laboral directa de una unidad física de producción.',
    h_per_LU: 'Horas de trabajo por unidad ganadera. Indicador de intensidad laboral para productos ganaderos expresado por unidad funcional de ganado.',
    tonnes_per_worker: 'Toneladas producidas por trabajador. Es una lectura directa de productividad física del trabajo.',
    GJ_per_worker: 'Energía alimentaria producida por trabajador, expresada en gigajulios. Compara productividad laboral con una unidad energética común.',
    monthly_wage: 'Salario mensual agrario estimado en dólares internacionales ajustados por paridad de poder adquisitivo cuando la fuente lo permite.',
    va_per_worker: 'Valor añadido agrario por trabajador. Aproxima productividad económica del trabajo a partir de cuentas nacionales y empleo agrario.',
    pct_child_labor: 'Porcentaje estimado de trabajo infantil asociado al trabajo agrario. Es un indicador sensible y depende de fuentes sociales con cobertura desigual.',
    hours_child_labor: 'Horas anuales de trabajo agrario asociadas a trabajo infantil. Se calculan aplicando el porcentaje estimado al total anual de horas agrarias.',
    pct_forced_labor: 'Porcentaje estimado de riesgo de trabajo forzoso. Procede de capas de riesgo social y, en varios casos, funciona como fotografía puntual, no como serie larga.',
    hours_forced_labor: 'Horas anuales de trabajo agrario asociadas a riesgo de trabajo forzoso. Al tener cobertura puntual, se visualiza como barras cuando solo hay un año.',
    pct_extreme_poverty: 'Porcentaje de trabajadores agrarios bajo umbral de pobreza extrema. Debe leerse como indicador social comparativo, no como recuento exacto.',
    hours_extreme_poverty: 'Horas anuales de trabajo agrario realizadas por trabajadores bajo umbral de pobreza extrema, calculadas a partir del porcentaje y las horas totales.',
    pct_not_covered: 'Porcentaje de trabajadores sin cobertura de protección social. Resume vulnerabilidad institucional del trabajo agrario.',
    hours_not_covered: 'Horas anuales de trabajo agrario realizadas por trabajadores sin cobertura de protección social.',
    fp_hours_total: 'Horas anuales asociadas a la huella comercial agraria. El flujo permite separar huella de consumo, horas importadas, horas exportadas y horas domésticas.',
    fp_hours_child: 'Horas de trabajo infantil embebidas en productos agrarios comerciados. Indicador sensible sujeto a cobertura social desigual.',
    fp_hours_forced: 'Horas de trabajo forzoso embebidas en productos agrarios comerciados. Indicador de riesgo social, no observación directa universal.',
  },
  en: {
    workers: 'People employed in agricultural activities, allocated by country, year and product category to reconstruct total agricultural labour.',
    hours_total: 'Annual agricultural labour hours. Combines workers and annual labour intensity to compare the total labour mobilised.',
    hours_per_worker: 'Annual hours per agricultural worker. Summarises average labour intensity per person employed in agriculture.',
    area_harvested: 'Harvested area associated with agricultural products, expressed in hectares and used as a basis for productivity indicators.',
    livestock_units: 'Comparable livestock units across species, used to express the physical scale of livestock production with a common functional unit.',
    production_tonnes: 'Agricultural production in tonnes, associated with each country, year and product category.',
    h_per_functional_unit: 'Labour required per functional unit. The unit can be a tonne of product, harvested hectare or livestock unit; in productivity you can invert it to read functional unit per hour.',
    h_per_ha: 'Labour hours per harvested hectare. Measures land labour intensity: how many hours are required per hectare.',
    h_per_tonne: 'Labour hours per tonne produced. Measures the direct labour footprint of a physical unit of production.',
    h_per_LU: 'Labour hours per livestock unit. Labour intensity for livestock products expressed per common livestock functional unit.',
    tonnes_per_worker: 'Tonnes produced per worker. A direct physical labour productivity measure.',
    GJ_per_worker: 'Food energy produced per worker, in gigajoules. Compares labour productivity using a common energy unit.',
    monthly_wage: 'Estimated monthly agricultural wage in international dollars adjusted by purchasing power parity where sources allow it.',
    va_per_worker: 'Agricultural value added per worker. A proxy for economic labour productivity based on national accounts and agricultural employment.',
    pct_child_labor: 'Estimated share of child labour associated with agricultural work. A sensitive indicator with uneven social-source coverage.',
    hours_child_labor: 'Annual agricultural labour hours associated with child labour, computed by applying the estimated share to total annual agricultural hours.',
    pct_forced_labor: 'Estimated forced-labour risk share. In several cases it is a point-in-time social risk layer, not a long annual series.',
    hours_forced_labor: 'Annual agricultural labour hours associated with forced-labour risk. When coverage is point-in-time, the viewer renders bars rather than a line.',
    pct_extreme_poverty: 'Share of agricultural workers below the extreme poverty threshold. Best read as a comparative social indicator.',
    hours_extreme_poverty: 'Annual agricultural labour hours performed by workers below the extreme poverty threshold, computed from the share and total hours.',
    pct_not_covered: 'Share of workers without social protection coverage. Summarises institutional vulnerability in agricultural labour.',
    hours_not_covered: 'Annual agricultural labour hours performed by workers without social protection coverage.',
    fp_hours_total: 'Annual labour hours associated with the agricultural trade footprint. The flow separates the consumption footprint, imported hours, exported hours and domestic hours.',
    fp_hours_child: 'Child-labour hours embedded in traded agricultural products. A sensitive indicator with uneven social-source coverage.',
    fp_hours_forced: 'Forced-labour hours embedded in traded agricultural products. A social risk indicator, not universal direct observation.',
  },
};

export function indicatorInfo(indicator, lang = 'es', metric = null) {
  if (!indicator) return '';
  const dict = INFO[lang] || INFO.es;
  let text = dict[indicator.id] || '';
  if (indicator.id === 'h_per_functional_unit' && metric?.functionalUnit) {
    const unitLabel = metric.functionalUnit.label?.[lang] || metric.functionalUnit.id;
    const direction = metric.productivityDirection === 'unit_per_hour'
      ? (lang === 'en' ? 'Current reading: functional unit per hour.' : 'Lectura actual: unidad funcional por hora.')
      : (lang === 'en' ? 'Current reading: hours per functional unit.' : 'Lectura actual: horas por unidad funcional.');
    text = `${text} ${lang === 'en' ? 'Selected unit' : 'Unidad seleccionada'}: ${unitLabel}. ${direction}`;
  }
  if (indicator.id === 'fp_hours_total' && metric?.footprintFlow) {
    text = `${text} ${lang === 'en' ? 'Selected flow' : 'Flujo seleccionado'}: ${metric.footprintFlow.label[lang]}. ${metric.footprintFlow.description[lang]}`;
  }
  return text;
}

