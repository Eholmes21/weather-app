import { WEATHER_MODELS, SUMMARY_PSEUDO_MODEL, type WeatherModel } from './types';
import './ModelSelector.css';

interface Props {
  selected: WeatherModel;
  onSelect: (m: WeatherModel) => void;
  isSummary: boolean;
  onSummaryClick: () => void;
  loading?: boolean;
}

export default function ModelSelector({ selected, onSelect, isSummary, onSummaryClick, loading }: Props) {
  return (
    <div className="model-selector">
      <span className="model-label">Fcst model:</span>
      <div className="model-buttons">
        <button
          className={`model-btn summary-btn ${isSummary ? 'active' : ''}`}
          onClick={onSummaryClick}
          disabled={loading}
          title={`${SUMMARY_PSEUDO_MODEL.description}\nBlended from all models`}
        >
          {SUMMARY_PSEUDO_MODEL.label}
        </button>
        {WEATHER_MODELS.map((m) => (
          <button
            key={m.id}
            className={`model-btn ${!isSummary && selected.id === m.id ? 'active' : ''}`}
            onClick={() => onSelect(m)}
            disabled={loading}
            title={`${m.description}\nResolution: ${m.resolution}\nForecast: ${m.maxHours}h`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {loading && <span className="model-loading">Loading…</span>}
      <span className="model-info">
        {isSummary
          ? SUMMARY_PSEUDO_MODEL.description
          : `${selected.description} • ${selected.resolution}`}
      </span>
    </div>
  );
}
