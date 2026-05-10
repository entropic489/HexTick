import styles from './TimeOfDayBadge.module.css';

type TimeOfDay = 'morning' | 'afternoon' | 'night';

function getTimeOfDay(tick: number): TimeOfDay {
  const r = tick % 3;
  if (r === 0) return 'morning';
  if (r === 1) return 'afternoon';
  return 'night';
}

function MorningSVG() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="20.5" y1="5.5" x2="18.4" y2="7.6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="3.5" y1="5.5" x2="5.6" y2="7.6" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="13" x2="19" y2="13" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="13" x2="5" y2="13" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="14" r="4" fill="#fbbf24" />
      <line x1="3" y1="20" x2="21" y2="20" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NoonSVG() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="#fbbf24" />
      <line x1="12" y1="2" x2="12" y2="5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="12" x2="5" y2="12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="12" x2="22" y2="12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="4.9" y1="4.9" x2="7" y2="7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="17" x2="19.1" y2="19.1" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="19.1" y1="4.9" x2="17" y2="7" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <line x1="7" y1="17" x2="4.9" y2="19.1" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NightSVG() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill="#818cf8"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SVG_MAP = { morning: MorningSVG, afternoon: NoonSVG, night: NightSVG };
const LABEL_MAP = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };

interface Props {
  tickNumber: number;
}

export function TimeOfDayBadge({ tickNumber }: Props) {
  const tod = getTimeOfDay(tickNumber);
  const Icon = SVG_MAP[tod];
  const day = Math.floor(tickNumber / 3);

  return (
    <span className={`${styles.badge} ${styles[tod]}`}>
      <Icon />
      <span className={styles.label}>{LABEL_MAP[tod]}</span>
      <span className={styles.day}>Day {day}</span>
    </span>
  );
}
