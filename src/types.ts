// ─── Weather Model Definitions ───────────────────────────────────────────────

export interface WeatherModel {
  id: string;
  label: string;
  apiParam: string;
  maxHours: number;       // typical forecast length in hours
  resolution: string;     // e.g. "1h", "3h", "6h"
  description: string;
}

export const WEATHER_MODELS: WeatherModel[] = [
  {
    id: 'gfs',
    label: 'GFS',
    apiParam: 'gfs_seamless',
    maxHours: 384,
    resolution: '1h (3h after 120h)',
    description: 'Global Forecast System – NOAA global model, ~13km',
  },
  {
    id: 'ecmwf',
    label: 'ECMWF',
    apiParam: 'ecmwf_ifs',
    maxHours: 360,
    resolution: '1h (3h after 90h, 6h after 144h)',
    description: 'European Centre IFS – global, 9km',
  },
  {
    id: 'aifs',
    label: 'AIFS',
    apiParam: 'ncep_gfs_graphcast025',
    maxHours: 384,
    resolution: '6h',
    description: 'GraphCast AI weather model – global, ~25km',
  },
  {
    id: 'nam',
    label: 'NAM',
    apiParam: 'ncep_nam_conus',
    maxHours: 60,
    resolution: '1h',
    description: 'North American Mesoscale – CONUS only, 3km',
  },
  {
    id: 'hrrr',
    label: 'HRRR',
    apiParam: 'ncep_hrrr_conus',
    maxHours: 48,
    resolution: '1h',
    description: 'High-Res Rapid Refresh – CONUS only, 3km',
  },
];

// ─── Summary pseudo-model (not a real API model) ────────────────────────────

export const SUMMARY_PSEUDO_MODEL: WeatherModel = {
  id: 'summary',
  label: 'Summary',
  apiParam: '',          // not used for API calls
  maxHours: 96,          // 4 days
  resolution: 'daily',
  description: 'AI-powered blend of all models',
};

// ─── Blended Summary Types ──────────────────────────────────────────────────

export interface BlendedDaySummary {
  date: Date;
  dayLabel: string;           // "Today", "Tomorrow", "Wednesday", etc.
  highTemp: number;           // °F
  lowTemp: number;            // °F
  rainSummary: string;        // AI-generated overall rain phrase
  detailSummary: string;      // AI-generated conversational paragraph
  avgWindSpeed: number;       // mph
  avgWindGusts: number;       // mph
  totalRain: number;          // inches
  dominantWeatherCode: number; // most frequent WMO code
  hours: ForecastHour[];      // blended hourly data
}

export interface SummaryData {
  location: Location;
  days: BlendedDaySummary[];
  updatedAt: Date;
}

// ─── Location ────────────────────────────────────────────────────────────────

export interface Location {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string; // state / region
}

export const DEFAULT_LOCATION: Location = {
  name: 'The Woodlands',
  latitude: 30.1658,
  longitude: -95.4613,
  country: 'United States',
  admin1: 'Texas',
};

// ─── Geocoding API response ─────────────────────────────────────────────────

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
}

export interface GeocodingResponse {
  results?: GeocodingResult[];
}

// ─── Forecast data (parsed) ─────────────────────────────────────────────────

export interface ForecastHour {
  time: Date;
  temperature: number | null;   // °F
  rain: number | null;          // inches
  windSpeed: number | null;     // mph
  windGusts: number | null;     // mph
  windDirection: number | null; // degrees
  weatherCode: number | null;   // WMO weather code for icons
}

export interface ForecastData {
  model: WeatherModel;
  location: Location;
  hours: ForecastHour[];
  updatedAt: Date;
}

// ─── WMO Weather Codes → icon/label mapping ────────────────────────────────

export interface WeatherCondition {
  label: string;
  icon: string; // emoji
}

export const WMO_CODES: Record<number, WeatherCondition> = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mainly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Depositing rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Moderate drizzle', icon: '🌦️' },
  55: { label: 'Dense drizzle', icon: '🌧️' },
  61: { label: 'Slight rain', icon: '🌧️' },
  63: { label: 'Moderate rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Light freezing rain', icon: '🌨️' },
  67: { label: 'Heavy freezing rain', icon: '🌨️' },
  71: { label: 'Slight snow', icon: '❄️' },
  73: { label: 'Moderate snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '❄️' },
  80: { label: 'Slight showers', icon: '🌦️' },
  81: { label: 'Moderate showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '🌧️' },
  85: { label: 'Slight snow showers', icon: '🌨️' },
  86: { label: 'Heavy snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'T-storm w/ slight hail', icon: '⛈️' },
  99: { label: 'T-storm w/ heavy hail', icon: '⛈️' },
};

export function getWeatherCondition(code: number | null): WeatherCondition {
  if (code === null) return { label: 'Unknown', icon: '❓' };
  return WMO_CODES[code] ?? { label: `Code ${code}`, icon: '❓' };
}
