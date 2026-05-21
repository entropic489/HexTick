import { useState } from 'react';
import styles from './NPCModal.module.css';

const NAMES_A = ['Alaric','Carver','Cleaver','Darnel','Eoin','Evander','Glyph','Hemlock','Herald','Lisbeth','Lucian','Luna','Lysander','Marius','Mend','Milo','Neria','Pan','Quill','Seraphine'];
const NAMES_B = ['Ainsley','Azura','Brave','Callan','Cedric','Crow','Finch','Gunnar','Harper','Liora','Lira','Lorelai','Lysandra','Marcellus','Shade','Shroud','Spade','Spike','Tanner','Thyme'];
const NAMES_C = ['Alder','Alistair','Caius','Dain','Dax','Dorian','Godric','Harkin','Hildred','Kael','Kavi','Mariner','Nazira','Onyx','Rolan','Rush','Sky','Storm','Taros','Thaddeus'];
const QUIRKS = ['Alert','Bald','Bright Eyes','Broad Face','Crooked Teeth','Gaunt','Good Posture','Grimy','Harsh Voice','Heavy Brow','Limps','Missing Ear','Muscular','Notable Hair','Pleasant Voice','Squints','Strong','Thick Eyebrows','Tired','Young'];
const BACKGROUNDS = ['Academic','Assassin','Blacksmith','Farmer','General','Gravedigger','Guard','Healer','Jailer','Laborer','Lord','Merchant','Monk','Mystic','Outlander','Peddler','Politician','Spy','Thief','Thug'];
const GOALS = ['Ascension','Cleansing','Conservation','Defense','Domination','Enrichment','Expansion','Freedom','Healing','Integration','Justice','Peace','Power','Preservation','Purification','Redemption','Revenge','Survival','Unity','Wealth'];
const VIRTUES = ['Cautious','Compassionate','Connected','Courageous','Disciplined','Discreet','Honest','Intelligent','Judicious','Loyal','Methodical','Meticulous','Polite','Popular','Pragmatic','Resourceful','Suave','Shrewd','Tenacious','Witty'];
const VICES = ['Aloof','Corrupt','Craven','Cruel','Cynical','Deceptive','Greedy','Impulsive','Incompetent','Inflexible','Manipulative','Mercurial','Naive','Pedantic','Ruthless','Sarcastic','Selfish','Stubborn','Vain','Xenophobic'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateNPC() {
  const tables = [NAMES_A, NAMES_B, NAMES_C];
  const [t1, t2] = tables.sort(() => Math.random() - 0.5).slice(0, 2);
  return {
    name: `${pick(t1)} ${pick(t2)}`,
    quirk: pick(QUIRKS),
    background: pick(BACKGROUNDS),
    goal: pick(GOALS),
    virtue: pick(VIRTUES),
    vice: pick(VICES),
  };
}

interface Props {
  onClose: () => void;
}

export function NPCModal({ onClose }: Props) {
  const [npc, setNpc] = useState(generateNPC);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.name}>{npc.name}</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          <Row label="Quirk" value={npc.quirk} />
          <Row label="Background" value={npc.background} />
          <Row label="Goal" value={npc.goal} />
          <Row label="Virtue" value={npc.virtue} />
          <Row label="Vice" value={npc.vice} />
        </div>
        <div className={styles.footer}>
          <button className={styles.reroll} onClick={() => setNpc(generateNPC())}>
            Reroll
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
