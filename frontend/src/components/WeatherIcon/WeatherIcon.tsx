import type { WeatherType } from '../../types';

interface Props {
  weather: WeatherType;
  size?: number;
}

export function WeatherIcon({ weather, size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label={weather}>
      {weather === 'fair' && (
        <>
          <circle cx="12" cy="12" r="4" fill="#f9e2af" />
          <line x1="12" y1="2" x2="12" y2="5" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="12" y1="19" x2="12" y2="22" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="2" y1="12" x2="5" y2="12" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="19" y1="12" x2="22" y2="12" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
          <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" stroke="#f9e2af" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
      {weather === 'overcast' && (
        <>
          <circle cx="10" cy="10" r="3.5" fill="#f9e2af" opacity="0.7" />
          <line x1="10" y1="3" x2="10" y2="5.5" stroke="#f9e2af" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="3" y1="10" x2="5.5" y2="10" stroke="#f9e2af" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="5.93" y1="5.93" x2="7.7" y2="7.7" stroke="#f9e2af" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="14.07" y1="5.93" x2="12.3" y2="7.7" stroke="#f9e2af" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <path d="M7 17a4 4 0 0 1 0-8 4.5 4.5 0 0 1 8.9 1A3 3 0 1 1 17 17H7z" fill="#9399b2" />
        </>
      )}
      {weather === 'inclement' && (
        <>
          <path d="M5 14a4 4 0 0 1 0-8 4.5 4.5 0 0 1 8.9 1A3 3 0 1 1 15 14H5z" fill="#7f849c" />
          <line x1="7" y1="17" x2="6" y2="20" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10" y1="17" x2="9" y2="20" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="17" x2="12" y2="20" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {weather === 'extreme' && (
        <>
          <path d="M4 13a4 4 0 0 1 0-8 4.5 4.5 0 0 1 8.9 1A3 3 0 1 1 14 13H4z" fill="#585b70" />
          <line x1="6" y1="16" x2="5" y2="19" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="16" x2="11" y2="19" stroke="#89b4fa" strokeWidth="1.5" strokeLinecap="round" />
          <polyline points="17,8 14,14 17,14 14,21" stroke="#f9e2af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
      {weather === 'catastrophic' && (
        <>
          <ellipse cx="12" cy="10" rx="5.5" ry="5" fill="#f38ba8" />
          <rect x="8.5" y="14" width="7" height="3" rx="1" fill="#f38ba8" />
          <circle cx="9.5" cy="9.5" r="1.5" fill="#1e1e2e" />
          <circle cx="14.5" cy="9.5" r="1.5" fill="#1e1e2e" />
          <rect x="11" y="13" width="2" height="4" fill="#f38ba8" />
          <line x1="7" y1="18" x2="17" y2="18" stroke="#f38ba8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="6" y1="20" x2="10" y2="16" stroke="#f38ba8" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="18" y1="20" x2="14" y2="16" stroke="#f38ba8" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
