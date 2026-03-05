import type { SummaryData } from './types';
import { getWeatherCondition } from './types';
import './SummaryView.css';

interface Props {
    data: SummaryData | null;
    loading: boolean;
    error: string | null;
}

const CARD_COLORS = [
    'card-color-0',
    'card-color-1',
    'card-color-2',
    'card-color-3',
    'card-color-4',
    'card-color-5',
    'card-color-6',
];

export default function SummaryView({ data, loading, error }: Props) {
    const hasApiKey = !!import.meta.env.VITE_GEMINI_API_KEY;

    if (error) {
        return <div className="summary-error">⚠️ {error}</div>;
    }

    if (loading && !data) {
        return (
            <div className="summary-loading">
                🔄 Fetching all models & generating summary…
                <div className="summary-loading-sub">Blending HRRR + NAM (priority) with GFS + ECMWF + AIFS</div>
            </div>
        );
    }

    if (!data || data.days.length === 0) {
        return <div className="summary-empty">No summary data available.</div>;
    }

    return (
        <div className="summary-wrap">
            {loading && <div className="summary-overlay">Updating…</div>}
            {!hasApiKey && (
                <div className="summary-api-warning">
                    ⚠️ No Gemini API key set — using basic fallback summaries. Add <code>VITE_GEMINI_API_KEY</code> to <code>.env</code> for AI-powered descriptions.
                </div>
            )}
            <div className="summary-grid">
                {data.days.map((day, i) => {
                    const cond = getWeatherCondition(day.dominantWeatherCode);
                    const dateStr = day.date.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                    });

                    return (
                        <div key={day.dayLabel} className={`summary-card ${CARD_COLORS[i % CARD_COLORS.length]}`}>
                            <div className="card-header">
                                <div className="card-day-info">
                                    <span className="card-day-label">{day.dayLabel}</span>
                                    <span className="card-day-date">{dateStr}</span>
                                </div>
                                <span className="card-weather-icon" title={cond.label}>{cond.icon}</span>
                            </div>
                            <div className="card-body">
                                <div className="card-top-row">
                                    <div className="card-temps">
                                        <span className="card-high">
                                            {day.highTemp}°
                                            <span className="card-temp-label">H</span>
                                        </span>
                                        <span className="card-low">
                                            {day.lowTemp}°
                                            <span className="card-temp-label">L</span>
                                        </span>
                                    </div>
                                    <div className="card-stats">
                                        <span className="card-stat">
                                            <span className="card-stat-icon">💨</span>
                                            <span className="card-stat-value">{day.avgWindSpeed}</span>
                                            <span className="card-stat-unit">mph</span>
                                        </span>
                                        <span className="card-stat">
                                            <span className="card-stat-icon">💧</span>
                                            <span className="card-stat-value">{day.totalRain}</span>
                                            <span className="card-stat-unit">in</span>
                                        </span>
                                        {day.avgWindGusts > day.avgWindSpeed + 5 && (
                                            <span className="card-stat">
                                                <span className="card-stat-icon">🌬️</span>
                                                <span className="card-stat-value">{day.avgWindGusts}</span>
                                                <span className="card-stat-unit">gusts</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="card-rain-summary">{day.rainSummary}</div>
                                <div className="card-detail">{day.detailSummary}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="summary-meta">
                Updated: {data.updatedAt.toLocaleTimeString()} • Blended model summary ({data.days.length} days)
            </div>
        </div>
    );
}
