import React, { useEffect, useState } from 'react';
import { CloudRain, Wind, Droplets, Thermometer, RefreshCw } from 'lucide-react';

// Open-Meteo: free, no API key. San Nicolas, Ilocos Norte.
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=18.1786&longitude=120.5967&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=Asia%2FManila&forecast_days=3';
const CODES = { 0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };

export default function WeatherCard() {
  const [w, setW] = useState(null);
  const [err, setErr] = useState('');
  async function load() {
    setErr('');
    try { const r = await fetch(URL); if (!r.ok) throw new Error(); setW(await r.json()); }
    catch { setErr('Weather is unavailable right now. Check your connection and try again.'); }
  }
  useEffect(() => { load(); }, []);
  const c = w?.current, d = w?.daily;
  const risk = c && (c.weather_code >= 95 || c.wind_speed_10m >= 50 || d.precipitation_probability_max[0] >= 80);
  return (
    <div className="glass rounded-glass shadow-glass-sm p-5 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-[15px] text-navy-900 m-0">Weather · San Nicolas</h3>
        <button onClick={load} aria-label="Refresh weather" className="text-navy-900/50 hover:bg-navy-900/8 rounded-lg p-1.5"><RefreshCw size={14} /></button>
      </div>
      {err && <p className="text-[12.5px] text-danger">{err}</p>}
      {!err && !w && <p className="text-[12.5px] text-navy-900/45">Loading…</p>}
      {c && (<>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div><b className="text-[34px] text-navy-900 leading-none">{Math.round(c.temperature_2m)}°C</b><div className="text-[12.5px] text-navy-900/60">{CODES[c.weather_code] || 'Fair'}</div></div>
          <div className="flex gap-6 text-[12.5px] text-navy-900/75">
            <span className="flex items-center gap-1.5"><Droplets size={14} />{c.relative_humidity_2m}%</span>
            <span className="flex items-center gap-1.5"><Wind size={14} />{Math.round(c.wind_speed_10m)} km/h</span>
            <span className="flex items-center gap-1.5"><CloudRain size={14} />{d.precipitation_probability_max[0]}% today</span>
            <span className="flex items-center gap-1.5"><Thermometer size={14} />{Math.round(d.temperature_2m_min[0])}–{Math.round(d.temperature_2m_max[0])}°C</span>
          </div>
          <span className={`ml-auto text-[11.5px] font-semibold rounded-full px-3 py-1 ${risk ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}>{risk ? 'Elevated weather risk' : 'No weather alert'}</span>
        </div>
      </>)}
    </div>
  );
}
