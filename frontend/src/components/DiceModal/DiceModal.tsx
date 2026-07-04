import { useState } from 'react';
import styles from './DiceModal.module.css';

interface Props {
  onClose: () => void;
}

function rollDice(numDice: number, numSides: number): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let face = 1; face <= numSides; face++) counts[face] = 0;
  for (let i = 0; i < numDice; i++) {
    const face = Math.floor(Math.random() * numSides) + 1;
    counts[face] += 1;
  }
  return counts;
}

export function DiceModal({ onClose }: Props) {
  const [numDice, setNumDice] = useState(1);
  const [numSides, setNumSides] = useState(6);
  const [counts, setCounts] = useState<Record<number, number> | null>(null);

  function handleRoll() {
    setCounts(rollDice(numDice, numSides));
  }

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Roll Dice</h3>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.form}>
          <div className={styles.row}>
            <span className={styles.label}>Number of dice</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={numDice}
              onChange={(e) => setNumDice(Number(e.target.value))}
            />
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Number of sides</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              value={numSides}
              onChange={(e) => setNumSides(Number(e.target.value))}
            />
          </div>
        </div>

        {counts && (
          <div className={styles.results}>
            {Object.entries(counts).map(([face, count]) => (
              <div key={face} className={styles.resultRow}>
                <span className={styles.resultLabel}>{face}</span>
                <span className={styles.resultValue}>{count}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.saveBtn}
            onClick={handleRoll}
            disabled={numDice < 1 || numSides < 1}
          >
            Roll
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
