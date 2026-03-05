import { useMemo } from 'react';
import type { ForecastData, ForecastHour } from './types';
import { getWeatherCondition } from './types';
import './ForecastTable.css';

interface Props {
  data: ForecastData | null;
  loading: boolean;
  error: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHour(d: Date): string {
  const h = d.getHours();
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

function formatDay(d: Date, isToday: boolean, isTomorrow: boolean): string {
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  if (isToday) return `Today — ${dayStr}`;
  if (isTomorrow) return `Tomorrow — ${dayStr}`;
  return dayStr;
}

function windArrow(deg: number | null): string {
  if (deg === null) return '';
  return '↓';
}

function rainColor(val: number | null): string {
  if (val === null || val === 0) return '';
  if (val < 0.05) return '#4f6f8f';
  if (val < 0.1) return '#446786';
  if (val < 0.25) return '#385a79';
  if (val < 0.5) return '#2d4f6d';
  return '#24435d';
}

function tempClass(temp: number | null): string {
  if (temp === null) return '';
  if (temp <= 32) return 'temp-freezing';
  if (temp <= 50) return 'temp-cold';
  if (temp <= 65) return 'temp-cool';
  if (temp <= 80) return 'temp-warm';
  if (temp <= 95) return 'temp-hot';
  return 'temp-extreme';
}

// ─── Group hours by day ─────────────────────────────────────────────────────

interface DayGroup {
  label: string;
  hours: ForecastHour[];
}

function groupByDay(hours: ForecastHour[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let currentKey = '';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (const h of hours) {
    const key = h.time.toDateString();
    if (key !== currentKey) {
      currentKey = key;
      const isToday = key === today.toDateString();
      const isTomorrow = key === tomorrow.toDateString();
      groups.push({ label: formatDay(h.time, isToday, isTomorrow), hours: [] });
    }
    groups[groups.length - 1].hours.push(h);
  }
  return groups;
}

// ─── Single Day Table ───────────────────────────────────────────────────────

const DAY_COLORS = [
  'day-color-0',
  'day-color-1',
  'day-color-2',
  'day-color-3',
  'day-color-4',
  'day-color-5',
  'day-color-6',
];

function DayTable({ day, index }: { day: DayGroup; index: number }) {
  const colCount = day.hours.length;
  const colorClass = DAY_COLORS[index % DAY_COLORS.length];

  return (
    <div className={`day-section ${colorClass}`}>
      <div className="day-title">{day.label}</div>
      <table className="day-table" style={{ '--col-count': colCount } as React.CSSProperties}>
        <thead>
          {/* Hour header */}
          <tr className="hour-header-row">
            <th className="row-label"></th>
            {day.hours.map((h, i) => (
              <th key={i} className="hour-cell">{formatHour(h.time)}</th>
            ))}
          </tr>
          {/* Weather icons */}
          <tr className="icon-row">
            <th className="row-label"></th>
            {day.hours.map((h, i) => {
              const cond = getWeatherCondition(h.weatherCode);
              return (
                <th key={i} className="icon-cell" title={cond.label}>{cond.icon}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Temperature */}
          <tr className="data-row temp-row">
            <td className="row-label">Temp <span className="unit">°F</span></td>
            {day.hours.map((h, i) => (
              <td key={i} className={`data-cell ${tempClass(h.temperature)}`}>
                {h.temperature !== null ? Math.round(h.temperature) + '°' : '–'}
              </td>
            ))}
          </tr>
          {/* Rain */}
          <tr className="data-row rain-row">
            <td className="row-label">Rain <span className="unit">in</span></td>
            {day.hours.map((h, i) => (
              <td
                key={i}
                className="data-cell"
                style={{
                  backgroundColor: rainColor(h.rain),
                  color: (h.rain ?? 0) > 0 ? '#eef4fb' : undefined,
                }}
              >
                {h.rain !== null && h.rain > 0 ? h.rain.toFixed(2) : ''}
              </td>
            ))}
          </tr>
          {/* Wind Speed */}
          <tr className="data-row wind-row">
            <td className="row-label">Wind <span className="unit">mph</span></td>
            {day.hours.map((h, i) => (
              <td key={i} className="data-cell">
                {h.windSpeed !== null ? Math.round(h.windSpeed) : '–'}
              </td>
            ))}
          </tr>
          {/* Wind Gusts */}
          <tr className="data-row gust-row">
            <td className="row-label">Gusts <span className="unit">mph</span></td>
            {day.hours.map((h, i) => (
              <td key={i} className="data-cell">
                {h.windGusts !== null ? Math.round(h.windGusts) : '–'}
              </td>
            ))}
          </tr>
          {/* Wind Direction */}
          <tr className="data-row dir-row">
            <td className="row-label">Dir.</td>
            {day.hours.map((h, i) => (
              <td key={i} className="data-cell dir-cell">
                <span
                  className="wind-arrow"
                  style={{
                    transform: h.windDirection !== null
                      ? `rotate(${h.windDirection + 180}deg)`
                      : undefined,
                    opacity: h.windDirection !== null ? 1 : 0.2,
                  }}
                >
                  {windArrow(h.windDirection)}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ForecastTable({ data, loading, error }: Props) {
  const days = useMemo(() => (data ? groupByDay(data.hours) : []), [data]);

  if (error) {
    return <div className="forecast-error">⚠️ {error}</div>;
  }

  if (loading && !data) {
    return <div className="forecast-loading">Loading forecast…</div>;
  }

  if (!data || data.hours.length === 0) {
    return <div className="forecast-empty">No forecast data available.</div>;
  }

  return (
    <div className="forecast-wrap">
      {loading && <div className="forecast-overlay">Updating…</div>}
      <div className="forecast-days">
        {days.map((day, i) => (
          <DayTable key={day.label} day={day} index={i} />
        ))}
      </div>
      <div className="forecast-meta">
        Updated: {data.updatedAt.toLocaleTimeString()} • Model: {data.model.label} • {data.model.resolution}
      </div>
    </div>
  );
}
