import { useState, useEffect, useCallback } from 'react';
import LocationSearch from './LocationSearch';
import ModelSelector from './ModelSelector';
import ForecastTable from './ForecastTable';
import SummaryView from './SummaryView';
import { fetchForecast, fetchSummary } from './api';
import { WEATHER_MODELS, DEFAULT_LOCATION } from './types';
import type { WeatherModel, Location, ForecastData, SummaryData } from './types';
import './App.css';

export default function App() {
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const [model, setModel] = useState<WeatherModel>(WEATHER_MODELS[0]); // GFS default
  const [isSummary, setIsSummary] = useState(false);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadForecast = useCallback(async (m: WeatherModel, loc: Location) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchForecast(m, loc);
      setForecast(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (loc: Location) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSummary(loc);
      setSummaryData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on model, location, or summary mode change
  useEffect(() => {
    if (isSummary) {
      loadSummary(location);
    } else {
      loadForecast(model, location);
    }
  }, [model, location, isSummary, loadForecast, loadSummary]);

  const handleModelChange = (m: WeatherModel) => {
    setIsSummary(false);
    setModel(m);
  };

  const handleSummaryClick = () => {
    setIsSummary(true);
  };

  const handleLocationChange = (loc: Location) => {
    setLocation(loc);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1 className="app-title">⛅ Weather Forecast</h1>
          <LocationSearch location={location} onLocationChange={handleLocationChange} />
        </div>
        <ModelSelector
          selected={model}
          onSelect={handleModelChange}
          isSummary={isSummary}
          onSummaryClick={handleSummaryClick}
          loading={loading}
        />
      </header>
      <main className="app-main">
        {isSummary ? (
          <SummaryView data={summaryData} loading={loading} error={error} />
        ) : (
          <ForecastTable data={forecast} loading={loading} error={error} />
        )}
      </main>
    </div>
  );
}
