import { useState, useRef, useEffect, useCallback } from 'react';
import { searchLocations } from './api';
import type { Location, GeocodingResult } from './types';
import './LocationSearch.css';

interface Props {
  location: Location;
  onLocationChange: (loc: Location) => void;
}

export default function LocationSearch({ location, onLocationChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsSearching(true);
    try {
      const r = await searchLocations(q);
      setResults(r);
      setIsOpen(r.length > 0);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (r: GeocodingResult) => {
    onLocationChange({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country,
      admin1: r.admin1,
    });
    setQuery('');
    setIsOpen(false);
    setResults([]);
  };

  const displayName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}${location.country ? ', ' + location.country : ''}`;

  return (
    <div className="location-search" ref={wrapperRef}>
      <div className="location-current">
        <span className="location-pin">📍</span>
        <span className="location-name">{displayName}</span>
      </div>
      <div className="location-input-wrap">
        <input
          type="text"
          className="location-input"
          placeholder="Search location..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        />
        {isSearching && <span className="location-spinner">⏳</span>}
      </div>
      {isOpen && (
        <ul className="location-dropdown">
          {results.map((r) => (
            <li key={r.id} onClick={() => handleSelect(r)}>
              <strong>{r.name}</strong>
              {r.admin1 && <span>, {r.admin1}</span>}
              {r.country && <span className="location-country">, {r.country}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
