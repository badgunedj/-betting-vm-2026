// Værdata fra Open-Meteo (gratis, ingen API-nøkkel, 10 000 req/dag)
// Relevant for Eliteserien: norske stadioner er utendørs, vær påvirker spillet

export interface MatchWeather {
  tempC: number;
  windKmh: number;
  rainMm: number;
  description: string;
  lowGoalRisk: boolean; // true = vind/regn kan redusere målscoring
}

export async function getMatchWeather(
  lat: number,
  lon: number,
  matchDate: string // "YYYY-MM-DD"
): Promise<MatchWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max` +
      `&start_date=${matchDate}&end_date=${matchDate}` +
      `&timezone=Europe%2FOslo`;

    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;

    const data = await res.json();
    const temp: number | null = data.daily?.temperature_2m_max?.[0] ?? null;
    const rain: number = data.daily?.precipitation_sum?.[0] ?? 0;
    const wind: number = data.daily?.windspeed_10m_max?.[0] ?? 0;

    if (temp == null) return null;

    // Forskning: vind >35 km/h reduserer mål med ~0.3-0.5 per kamp
    const lowGoalRisk = wind > 35 || rain > 8;

    let description: string;
    if (wind > 40)      description = `Kraftig vind ${wind.toFixed(0)} km/h — forventer færre mål`;
    else if (rain > 8)  description = `Kraftig regn ${rain.toFixed(1)} mm — tung bane`;
    else if (wind > 25) description = `Moderat vind ${wind.toFixed(0)} km/h`;
    else                description = `Gode forhold, ${temp.toFixed(0)}°C`;

    return { tempC: temp, windKmh: wind, rainMm: rain, description, lowGoalRisk };
  } catch {
    return null;
  }
}
