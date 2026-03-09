import type {
  GeocodingResponse,
  GeocodingResult,
  WeatherModel,
  ForecastHour,
  ForecastData,
  Location,
  BlendedDaySummary,
  SummaryData,
} from './types';
import { WEATHER_MODELS } from './types';

// ─── Open-Meteo base URLs ───────────────────────────────────────────────────

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ECMWF_URL = 'https://api.open-meteo.com/v1/ecmwf';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// ─── Hourly variables we always request ─────────────────────────────────────

const HOURLY_VARS = [
  'temperature_2m',
  'precipitation',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'weather_code',
].join(',');

// ─── Geocoding ──────────────────────────────────────────────────────────────

export async function searchLocations(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data: GeocodingResponse = await res.json();
  return data.results ?? [];
}

// ─── Forecast fetching ──────────────────────────────────────────────────────

export async function fetchForecast(
  model: WeatherModel,
  location: Location,
  forecastDays = 7,
): Promise<ForecastData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: HOURLY_VARS,
    models: model.apiParam,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: String(forecastDays),
  });

  // ECMWF models use the /v1/ecmwf endpoint; everything else uses /v1/forecast
  const baseUrl = model.apiParam.startsWith('ecmwf_') ? ECMWF_URL : FORECAST_URL;

  const res = await fetch(`${baseUrl}?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Forecast API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return parseForecastResponse(json, model, location);
}

// ─── Response parsing ───────────────────────────────────────────────────────

function parseForecastResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any,
  model: WeatherModel,
  location: Location,
): ForecastData {
  const hourly = json.hourly;
  if (!hourly || !hourly.time) {
    throw new Error('Invalid API response: no hourly data');
  }

  // Open-Meteo keys data by model suffix, e.g. temperature_2m_gfs_seamless
  // OR just temperature_2m if only one model requested. We need to detect both.
  const suffix = `_${model.apiParam}`;

  const get = (base: string): (number | null)[] => {
    // Try with model suffix first, then plain key
    return hourly[base + suffix] ?? hourly[base] ?? [];
  };

  const times: string[] = hourly.time;
  const temps = get('temperature_2m');
  const rain = get('precipitation');
  const windSpeed = get('wind_speed_10m');
  const windGusts = get('wind_gusts_10m');
  const windDir = get('wind_direction_10m');
  const weatherCode = get('weather_code');

  const hours: ForecastHour[] = times.map((t, i) => ({
    time: new Date(t),
    temperature: temps[i] ?? null,
    rain: rain[i] ?? null,
    windSpeed: windSpeed[i] ?? null,
    windGusts: windGusts[i] ?? null,
    windDirection: windDir[i] ?? null,
    weatherCode: weatherCode[i] ?? null,
  }));

  // Filter out hours where everything is null (model didn't produce that timestep)
  const validHours = hours.filter(
    (h) =>
      h.temperature !== null ||
      h.rain !== null ||
      h.windSpeed !== null,
  );

  return {
    model,
    location,
    hours: validHours,
    updatedAt: new Date(),
  };
}

// ─── Summary: Fetch all models ──────────────────────────────────────────────

async function fetchAllModels(location: Location): Promise<ForecastData[]> {
  const results = await Promise.allSettled(
    WEATHER_MODELS.map((m) => fetchForecast(m, location, 7)),
  );

  const forecasts: ForecastData[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') forecasts.push(r.value);
  }
  if (forecasts.length === 0) throw new Error('All model fetches failed');
  return forecasts;
}

// ─── Summary: Blend hourly data ─────────────────────────────────────────────

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function avgWindDirection(dirs: number[]): number {
  if (dirs.length === 0) return 0;
  let sumSin = 0;
  let sumCos = 0;
  for (const dir of dirs) {
    const rad = (dir * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  }
  const avgRad = Math.atan2(sumSin / dirs.length, sumCos / dirs.length);
  let avgDir = (avgRad * 180) / Math.PI;
  if (avgDir < 0) avgDir += 360;
  return Math.round(avgDir);
}

function blendForecasts(forecasts: ForecastData[]): ForecastHour[] {
  // Separate models by priority tier
  const highPriority = forecasts.filter(
    (f) => f.model.id === 'hrrr' || f.model.id === 'nam',
  );
  const lowPriority = forecasts.filter(
    (f) => f.model.id === 'gfs' || f.model.id === 'ecmwf' || f.model.id === 'aifs',
  );

  // Build a lookup: timestamp → ForecastHour[] per tier
  const highMap = new Map<number, ForecastHour[]>();
  const lowMap = new Map<number, ForecastHour[]>();

  for (const f of highPriority) {
    for (const h of f.hours) {
      const key = h.time.getTime();
      if (!highMap.has(key)) highMap.set(key, []);
      highMap.get(key)!.push(h);
    }
  }
  for (const f of lowPriority) {
    for (const h of f.hours) {
      const key = h.time.getTime();
      if (!lowMap.has(key)) lowMap.set(key, []);
      lowMap.get(key)!.push(h);
    }
  }

  // Collect all unique timestamps, sorted
  const allTimes = new Set<number>();
  for (const f of forecasts) for (const h of f.hours) allTimes.add(h.time.getTime());
  const sortedTimes = [...allTimes].sort((a, b) => a - b);

  // Blend
  const blended: ForecastHour[] = [];
  for (const ts of sortedTimes) {
    const sources = highMap.get(ts) ?? lowMap.get(ts);
    if (!sources || sources.length === 0) continue;

    const temps = sources.map((s) => s.temperature).filter((v): v is number => v !== null);
    const rains = sources.map((s) => s.rain).filter((v): v is number => v !== null);
    const winds = sources.map((s) => s.windSpeed).filter((v): v is number => v !== null);
    const gusts = sources.map((s) => s.windGusts).filter((v): v is number => v !== null);
    const dirs = sources.map((s) => s.windDirection).filter((v): v is number => v !== null);
    const codes = sources.map((s) => s.weatherCode).filter((v): v is number => v !== null);

    blended.push({
      time: new Date(ts),
      temperature: temps.length > 0 ? Math.round(avg(temps) * 10) / 10 : null,
      rain: rains.length > 0 ? Math.round(avg(rains) * 1000) / 1000 : null,
      windSpeed: winds.length > 0 ? Math.round(avg(winds) * 10) / 10 : null,
      windGusts: gusts.length > 0 ? Math.round(avg(gusts) * 10) / 10 : null,
      windDirection: dirs.length > 0 ? avgWindDirection(dirs) : null,
      weatherCode: codes.length > 0 ? mostFrequent(codes) : null,
    });
  }

  return blended;
}

function mostFrequent(arr: number[]): number {
  const counts = new Map<number, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = arr[0], bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) { best = val; bestCount = count; }
  }
  return best;
}

// ─── Summary: Build day summaries ───────────────────────────────────────────

function buildDaySummaries(
  blendedHours: ForecastHour[],
): Omit<BlendedDaySummary, 'rainSummary' | 'detailSummary'>[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Group by day (up to 7 days)
  const dayBuckets = new Map<string, ForecastHour[]>();
  const dayDates = new Map<string, Date>();

  for (const h of blendedHours) {
    const d = new Date(h.time);
    d.setHours(0, 0, 0, 0);
    const key = d.toDateString();
    if (!dayBuckets.has(key)) {
      dayBuckets.set(key, []);
      dayDates.set(key, d);
    }
    dayBuckets.get(key)!.push(h);
  }

  // Sort days chronologically, take up to 7
  const sortedKeys = [...dayBuckets.keys()].sort(
    (a, b) => dayDates.get(a)!.getTime() - dayDates.get(b)!.getTime(),
  );
  const dayKeys = sortedKeys.slice(0, 7);

  return dayKeys.map((key) => {
    const hours = dayBuckets.get(key)!;
    const date = dayDates.get(key)!;

    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : dayName;

    const temps = hours.map((h) => h.temperature).filter((v): v is number => v !== null);
    const rains = hours.map((h) => h.rain).filter((v): v is number => v !== null);
    const winds = hours.map((h) => h.windSpeed).filter((v): v is number => v !== null);
    const gusts = hours.map((h) => h.windGusts).filter((v): v is number => v !== null);
    const dirs = hours.map((h) => h.windDirection).filter((v): v is number => v !== null);
    const codes = hours.map((h) => h.weatherCode).filter((v): v is number => v !== null);

    return {
      date,
      dayLabel,
      highTemp: temps.length > 0 ? Math.round(Math.max(...temps)) : 0,
      lowTemp: temps.length > 0 ? Math.round(Math.min(...temps)) : 0,
      avgWindSpeed: winds.length > 0 ? Math.round(avg(winds)) : 0,
      avgWindGusts: gusts.length > 0 ? Math.round(avg(gusts)) : 0,
      avgWindDirection: dirs.length > 0 ? avgWindDirection(dirs) : 0,
      totalRain: rains.length > 0 ? Math.round(rains.reduce((a, b) => a + b, 0) * 100) / 100 : 0,
      dominantWeatherCode: codes.length > 0 ? mostFrequent(codes) : 0,
      hours,
    };
  });
}

// ─── Summary: AI Generation via Gemini ──────────────────────────────────────

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

// Period definitions: morning, afternoon, evening
const PERIODS = [
  { label: 'Morning', timeRange: '7 AM – 12 PM', startHour: 7, endHour: 12 },
  { label: 'Afternoon', timeRange: '12 PM – 4 PM', startHour: 12, endHour: 16 },
  { label: 'Evening', timeRange: '4 PM – 10 PM', startHour: 16, endHour: 22 },
] as const;

interface PeriodStats {
  label: string;
  timeRange: string;
  highTemp: number;
  lowTemp: number;
  rainTotal: number;
  avgWind: number;
  maxGusts: number;
  hourlyDetail: string;
}

function computePeriodStats(hours: ForecastHour[]): PeriodStats[] {
  return PERIODS.map((p) => {
    const periodHours = hours.filter((h) => {
      const hr = h.time.getHours();
      return hr >= p.startHour && hr < p.endHour;
    });

    const temps = periodHours.map((h) => h.temperature).filter((v): v is number => v !== null);
    const rains = periodHours.map((h) => h.rain).filter((v): v is number => v !== null);
    const winds = periodHours.map((h) => h.windSpeed).filter((v): v is number => v !== null);
    const gusts = periodHours.map((h) => h.windGusts).filter((v): v is number => v !== null);

    const hourlyDetail = periodHours
      .map((h) => {
        const hr = h.time.getHours();
        const ampm = hr < 12 ? 'AM' : 'PM';
        const displayHr = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
        return `${displayHr}${ampm}: ${h.temperature !== null ? Math.round(h.temperature) : '?'}°F, rain=${h.rain !== null ? h.rain.toFixed(2) : '0'}in, wind=${h.windSpeed !== null ? Math.round(h.windSpeed) : '?'}mph (dir: ${h.windDirection !== null ? h.windDirection : '?'}°), gusts=${h.windGusts !== null ? Math.round(h.windGusts) : '?'}mph`;
      })
      .join('; ');

    return {
      label: p.label,
      timeRange: p.timeRange,
      highTemp: temps.length > 0 ? Math.round(Math.max(...temps)) : 0,
      lowTemp: temps.length > 0 ? Math.round(Math.min(...temps)) : 0,
      rainTotal: rains.length > 0 ? Math.round(rains.reduce((a, b) => a + b, 0) * 100) / 100 : 0,
      avgWind: winds.length > 0 ? Math.round(avg(winds)) : 0,
      maxGusts: gusts.length > 0 ? Math.round(Math.max(...gusts)) : 0,
      hourlyDetail,
    };
  });
}

interface GeminiDayResult {
  rainSummary: string;
  detailSummary: string;
}

type DayWithoutAI = Omit<BlendedDaySummary, 'rainSummary' | 'detailSummary'>;

async function generateAISummaries(
  days: DayWithoutAI[],
  location: Location,
): Promise<GeminiDayResult[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const allPeriodStats = days.map((d) => computePeriodStats(d.hours));

  if (!apiKey) {
    return buildFallback(days, allPeriodStats);
  }

  const dayDescriptions = days.map((d, i) => {
    const ps = allPeriodStats[i];
    const periodBlocks = ps.map((p) =>
      `  ${p.label} (${p.timeRange}): Temps ${p.lowTemp}–${p.highTemp}°F, Rain ${p.rainTotal}in, Wind avg ${p.avgWind}mph, Gusts up to ${p.maxGusts}mph\n    Hourly: ${p.hourlyDetail || 'No data'}`
    ).join('\n');

    return `${d.dayLabel} (${d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}):
  Overall: High ${d.highTemp}°F, Low ${d.lowTemp}°F, Total rain ${d.totalRain}in, Avg wind ${d.avgWindSpeed}mph, Gusts ${d.avgWindGusts}mph, Avg Wind Dir ${d.avgWindDirection}°
${periodBlocks}`;
  });

  const prompt = `You are a friendly, conversational weather forecaster for ${location.name}${location.admin1 ? ', ' + location.admin1 : ''}. Your audience is everyday people who want to know how to plan their day — they don't read weather graphs.

For each day, provide:
1. "rainSummary": A short, natural phrase about rain (e.g. "On and off showers all day", "Light rain early, clearing by lunch", "Dry and sunny"). Under 10 words.
2. "detailSummary": A conversational paragraph (5-8 sentences) that walks through the day naturally. DON'T use rigid "Morning / Afternoon / Evening" labels — instead, weave through the day conversationally, calling out specific times when they matter. For example:
   - "You'll wake up to cool temps in the low 50s, but it warms up fast — by lunchtime you're looking at 75°F."
   - "Rain moves in around 2pm and sticks around through the evening rush, so grab an umbrella if you're heading out after work."
   - "Expect on-and-off showers between 10am and 3pm — nothing heavy, but you'll want an umbrella if you're out and about."
   - "Winds die down after sunset, making it a nice evening to be outside."
   
   CRITICAL RAIN RULE: Look at the hourly rain data carefully. When rain is expected, you MUST say approximately WHEN — give specific time windows like "rain from around 2-5pm" or "showers starting mid-morning and tapering off by 3pm" or "light drizzle on and off between 8am and noon." NEVER just say "rain is expected" or "some rain" without saying when. If rain is scattered across the day, say something like "scattered showers throughout the day, heaviest around 1-3pm." If it's dry all day, say so clearly and move on.
   
   CRITICAL WIND RULE: You MUST call out the wind direction somewhere in the detail summary for EVERY single day. Give typical directions like North, South, NW, etc. Look at the average wind direction for the day (0=N, 90=E, 180=S, 270=W) or the hourly changes and mention where the wind is coming from.
   
   Focus on what MATTERS to someone planning their day: When exactly should I carry an umbrella? Is it jacket weather? Can I eat outside tonight? Will my morning run be comfortable? Is it going to be miserably hot? Highlight big temperature swings, gusty winds, rain start/stop times, and comfort level. Don't just list numbers — interpret them. If rain is intermittent, describe the pattern.

Respond with ONLY a JSON array of objects, one per day, in order. No markdown, no code fences, no explanation.

${dayDescriptions.join('\n\n')}`;

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 2000,
        },
      }),
    });
  } catch (err) {
    console.warn('Gemini API network error, using fallback summaries:', err);
    return buildFallback(days, allPeriodStats);
  }

  if (!res.ok) {
    console.warn('Gemini API error, using fallback summaries:', res.status);
    return buildFallback(days, allPeriodStats);
  }

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed: GeminiDayResult[] = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length >= days.length) {
      return parsed.slice(0, days.length);
    }
    while (parsed.length < days.length) {
      const idx = parsed.length;
      parsed.push(buildFallback([days[idx]], [allPeriodStats[idx]])[0]);
    }
    return parsed;
  } catch (e) {
    console.warn('Failed to parse Gemini response, using fallback:', e, text);
    return buildFallback(days, allPeriodStats);
  }
}

function formatHour(hour: number): string {
  const ampm = hour < 12 ? 'AM' : 'PM';
  const displayHr = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHr} ${ampm}`;
}

interface RainWindow { start: number; end: number; total: number; }

function findRainWindows(hours: ForecastHour[]): RainWindow[] {
  const windows: RainWindow[] = [];
  let current: RainWindow | null = null;

  for (const h of hours) {
    const hr = h.time.getHours();
    const hasRain = h.rain !== null && h.rain > 0.01;

    if (hasRain) {
      if (current === null) {
        current = { start: hr, end: hr, total: h.rain! };
      } else if (hr <= current.end + 2) {
        // Allow a 1-hour gap to merge nearby rain windows
        current.end = hr;
        current.total += h.rain!;
      } else {
        windows.push(current);
        current = { start: hr, end: hr, total: h.rain! };
      }
    }
  }
  if (current !== null) windows.push(current);
  return windows;
}

function describeRainTiming(hours: ForecastHour[], totalRain: number): { summary: string; detail: string } {
  const windows = findRainWindows(hours);

  if (windows.length === 0 || totalRain === 0) {
    return { summary: 'Dry and clear', detail: 'No rain in the forecast — a dry day ahead.' };
  }

  // Check if rain covers most of the day (>10 hours)
  const totalRainHours = windows.reduce((sum, w) => sum + (w.end - w.start + 1), 0);

  if (totalRainHours >= 10) {
    return {
      summary: 'Rain most of the day',
      detail: `Rain is expected throughout most of the day, totaling about ${totalRain} inches. Bring an umbrella.`,
    };
  }

  if (windows.length === 1) {
    const w = windows[0];
    const timeStr = w.start === w.end
      ? `around ${formatHour(w.start)}`
      : `between ${formatHour(w.start)} – ${formatHour(w.end + 1)}`;

    if (totalRain > 0.5) {
      return {
        summary: `Heavy rain ${timeStr}`,
        detail: `Expect significant rain ${timeStr}, totaling about ${totalRain} inches. Plan accordingly.`,
      };
    } else if (totalRain > 0.1) {
      return {
        summary: `Rain ${timeStr}`,
        detail: `Light rain is expected ${timeStr}, around ${totalRain} inches total.`,
      };
    } else {
      return {
        summary: `Sprinkles ${timeStr}`,
        detail: `A light sprinkle is possible ${timeStr}, but nothing major.`,
      };
    }
  }

  // Multiple rain windows — on and off
  const windowStrs = windows.map(w =>
    w.start === w.end ? formatHour(w.start) : `${formatHour(w.start)}–${formatHour(w.end + 1)}`
  );
  const heaviestWindow = windows.reduce((a, b) => b.total > a.total ? b : a);
  const heaviestStr = heaviestWindow.start === heaviestWindow.end
    ? `around ${formatHour(heaviestWindow.start)}`
    : `${formatHour(heaviestWindow.start)}–${formatHour(heaviestWindow.end + 1)}`;

  return {
    summary: `On-and-off rain`,
    detail: `Scattered showers expected around ${windowStrs.join(' and ')}, totaling about ${totalRain} inches. Heaviest rain ${heaviestStr}.`,
  };
}

function buildFallback(
  days: DayWithoutAI[],
  allPeriodStats: PeriodStats[][],
): GeminiDayResult[] {
  return days.map((d, i) => {
    const ps = allPeriodStats[i];
    const parts: string[] = [];
    parts.push(`Expect a high of ${d.highTemp}°F and a low of ${d.lowTemp}°F.`);

    const rainInfo = describeRainTiming(d.hours, d.totalRain);
    parts.push(rainInfo.detail);

    parts.push(`Winds will average around ${d.avgWindSpeed} mph${d.avgWindGusts > d.avgWindSpeed + 5 ? ` with gusts up to ${d.avgWindGusts} mph` : ''}.`);
    if (ps[0].highTemp - ps[2].lowTemp > 20) {
      parts.push(`Big temperature swing today — dress in layers.`);
    }
    return {
      rainSummary: rainInfo.summary,
      detailSummary: parts.join(' '),
    };
  });
}

// ─── Summary: Main entry point ──────────────────────────────────────────────

export async function fetchSummary(location: Location): Promise<SummaryData> {
  const forecasts = await fetchAllModels(location);
  const blendedHours = blendForecasts(forecasts);
  const rawDays = buildDaySummaries(blendedHours);
  const aiResults = await generateAISummaries(rawDays, location);

  const days: BlendedDaySummary[] = rawDays.map((d, i) => ({
    ...d,
    rainSummary: aiResults[i].rainSummary,
    detailSummary: aiResults[i].detailSummary,
  }));

  return { location, days, updatedAt: new Date() };
}
