import type { Hex, WeatherType } from '../types';

export interface MoveCostModifier {
  label: string;
  value: number;
}

export interface MoveCostBreakdown {
  total: number;
  base: number;
  modifiers: MoveCostModifier[];
  blocked: boolean;
}

const WEATHER_PENALTY: Partial<Record<WeatherType, number>> = { inclement: 1, extreme: 2 };

export function computeMoveCost(origin: Hex | null, destination: Hex, tickNumber: number, weather: WeatherType = 'fair'): MoveCostBreakdown {
  if (weather === 'catastrophic') {
    return { total: 999, base: 0, modifiers: [], blocked: true };
  }
  const isNight = tickNumber % 3 === 2;
  const isRoad = origin?.has_roads === true && destination.has_roads;
  const base = isRoad ? 1 : destination.terrain_difficulty;
  const modifiers: MoveCostModifier[] = [];

  if (isNight) modifiers.push({ label: 'Night', value: 1 });
  const weatherPenalty = WEATHER_PENALTY[weather];
  if (weatherPenalty) modifiers.push({ label: weather.charAt(0).toUpperCase() + weather.slice(1), value: weatherPenalty });

  return { total: base + modifiers.reduce((s, m) => s + m.value, 0), base, modifiers, blocked: false };
}
