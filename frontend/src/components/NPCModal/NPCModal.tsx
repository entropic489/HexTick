import { useState } from 'react';
import styles from './NPCModal.module.css';

const NAMES_A = ['Alaric','Carver','Cleaver','Darnel','Eoin','Evander','Glyph','Hemlock','Herald','Lisbeth','Lucian','Luna','Lysander','Marius','Mend','Milo','Neria','Pan','Quill','Seraphine'];
const NAMES_B = ['Ainsley','Azura','Brave','Callan','Cedric','Crow','Finch','Gunnar','Harper','Liora','Lira','Lorelai','Lysandra','Marcellus','Shade','Shroud','Spade','Spike','Tanner','Thyme'];
const NAMES_C = ['Alder','Alistair','Caius','Dain','Dax','Dorian','Godric','Harkin','Hildred','Kael','Kavi','Mariner','Nazira','Onyx','Rolan','Rush','Sky','Storm','Taros','Thaddeus'];
const QUIRKS = ['Alert','Bald','Bright Eyes','Broad Face','Crooked Teeth','Gaunt','Good Posture','Grimy','Harsh Voice','Heavy Brow','Limps','Missing Ear','Muscular','Notable Hair','Pleasant Voice','Squints','Strong','Thick Eyebrows','Tired','Young'];
const BACKGROUNDS = ['Academic','Acolyte','Acrobat','Alchemist','Apothecary','Assassin','Astrologer','Baker','Barber-Surgeon','Barkeep','Beadle','Beekeeper','Bell Ringer','Bird Keeper','Blacksmith','Bookbinder','Bounty Hunter','Butcher','Carpenter','Cartographer','Cartwright','Chandler','Charlatan','Chimney Sweep','Clockmaker','Cobbler','Cook','Cooper','Courier','Crypt Custodian','Cultist','Demolitionist','Dowser','Duelist','Entertainer','Executioner','Falconer','Farmer','Fence','Fisher','Fletcher','Gambler','Gardener','General','Glassblower','Gong Farmer','Gravedigger','Guard','Healer','Herald','Herbalist','Hermit','Highway Robber','Hunter','Illusionist','Innkeeper','Jailer','Jester','Jeweler','Knight','Laborer','Lamplighter','Leech Collector','Librarian','Locksmith','Lord','Lumberjack','Mason','Merchant','Miller','Miner','Monk','Musician','Mystic','Naturalist','Navigator','Oil Collector','Outlander','Painter','Peddler','Philosopher','Physician','Pilgrim','Politician','Potter','Priest','Prospector','Rat Catcher','Sailor','Scribe','Shepherd','Smuggler','Soldier','Spy','Stablehand','Street Preacher','Tailor','Tanner','Tax Collector','Thief','Thug','Tinker','Toll Keeper','Toymaker','Vagabond','Vintner','Weaver','Witch','Witchfinder'];
const GOALS = ['Ascension','Cleansing','Conservation','Defense','Domination','Enrichment','Expansion','Freedom','Healing','Integration','Justice','Peace','Power','Preservation','Purification','Redemption','Revenge','Survival','Unity','Wealth'];
const VIRTUES = ['Cautious','Compassionate','Connected','Courageous','Disciplined','Discreet','Honest','Intelligent','Judicious','Loyal','Methodical','Meticulous','Polite','Popular','Pragmatic','Resourceful','Suave','Shrewd','Tenacious','Witty'];
const VICES = ['Aloof','Corrupt','Craven','Cruel','Cynical','Deceptive','Greedy','Impulsive','Incompetent','Inflexible','Manipulative','Mercurial','Naive','Pedantic','Ruthless','Sarcastic','Selfish','Stubborn','Vain','Xenophobic'];

const BODY_PARTS = ['Eye','Ear','Leg (with foot)','Arm (with hand)','Hand','Foot','Nose','Mouth','Toe','Head'];
const SKIN_COLORS = ['Green','Blue','Yellow','Orange','Red','Polka-Dot','Black','Purple','White','Grey'];
const HAIR_EXTREMITIES = ['regular hair areas','eyebrows','eyelashes','arms','legs','whole body'];
const WYRDNESS: Record<number, string> = {
  2: 'You are a home to bees that obey your commands. Gain a ranged attack, Unleash the Bees (d4). Getting hit with this attack causes disadvantage on the next DEX save. Lose 1 STR as your body is consumed by bees.',
  3: 'You are a gravitational anomaly. You can pull or push small objects to yourself, and impose disadvantage on DEX saves.',
  4: 'You can feel the emotions of others. In the presence of very strong emotion, you must make a WIL save to avoid being overwhelmed.',
  5: 'You become very sticky.',
  6: 'You have turned to stone. You can still move as normal, are twice as heavy, and do not require food, but all your emotions are gone. Gain +1 Armor.',
  7: 'You are fish! Gain gills and webbed fingers and toes. You suffer no movement penalties in water.',
  8: 'You secrete pheromones that have a 1-in-4 chance to charm strangers you meet.',
  9: 'You are part vegetable now. Your skin takes on a greenish hue. If you stand in one place too long, you find yourself growing roots. You still need rations, but you also require sunlight or start to become depressed and fatigued after three days.',
  10: 'You are very cold. Cold to the touch, able to freeze water with just a moment or two. You are uncomfortably cold to be around. You feel fine.',
  11: 'You are unbearably warm. You heat up every space you\'re in. You feel fine.',
  12: 'You gain infrared vision, but also become color blind.',
  13: 'You become sensitive to mana. You can tell when a spell is cast, or if a mana source is nearby.',
  14: 'Your scent becomes irresistible to predator animals.',
  15: 'The scent of blood burns in your nostrils. You need blood. You must drink blood daily or become Fatigued.',
  16: 'You become a chimera of human and some other animal. A Die of Fate determines how well you control this process.',
  17: 'Vestigial wings sprout on your back. Perhaps with training, they could become strong enough to carry you?',
  18: 'Gain a tail. You\'re able to guide this process aesthetically.',
  19: 'Your face Picassos. You may guide this process aesthetically. Your eyes, ears, nose, and mouth must migrate to new locations.',
  20: 'You are bioluminescent.',
  21: 'You age D12 years in Die of Fate direction.',
  22: 'Your voice is either impossibly quiet or loud, respectively on a Die of Fate.',
  23: 'You go blind, but gain echolocation.',
  24: 'You go deaf, but can smell others\' emotional states.',
  25: 'You become transparent. Not invisible, transparent.',
  26: 'Your cells vibrate loudly. You produce an audible hum.',
  27: 'One of your arms gains a mind of its own. Sometimes it obeys, sometimes it does not on a Die of Fate.',
  28: 'Animals no longer register you as alive. They ignore you completely.',
  29: 'Most of your cells are cancer now. You are rapidly deteriorating. Die in d6 days.',
  30: 'No magical effect can target you. Spells with you as their focus slide right off without effect.',
  31: 'The thoughts of others come alive for you. You can read their minds, though they can make a WIL save to resist. You can send a message to a mind you\'ve touched before.',
  32: 'Two budding horns appear on your forehead, as well as a vestigial tail. Temptation and dark impulses grip you, and you wish to spread this to others.',
  33: 'Your flesh sloughs off, leaving you an ambulatory skeleton. You feel fine.',
  34: 'You are gripped by oracular vision, consumed by horrible nightmares. Distracting images and words enter your mind, causing you to lose focus often. Once per session, you can ask the GM for a piece of information you have no way of knowing otherwise.',
  35: 'Your burp deals d4 damage, and poisons a target (STR save or lose their next turn).',
  36: 'Your body parts can detach at will. When detached, they still function as if attached to you. If they\'re lost, there\'s no getting them back.',
  37: 'You become attuned with the weather, and can influence a weather die roll by plus or minus 1. When you do this, lightning has a chance to strike you for D6.',
  38: 'You become incorporeal, a living ghost. You can maintain your position and move normally, passing through solid objects, but are stopped by iron. Unfortunately, you still need to eat to live, and no longer can. You will die in D12 + 6 days.',
  39: 'A new consciousness now lurks in your mind, and madness threatens to overtake you. You hear a name: Half-Damned.',
  40: 'Long-dormant DNA lines activate. You gain 1 Inborn Mana and learn one random Nayme. Yer a wyzard, friend.',
};

function d(sides: number) { return Math.floor(Math.random() * sides) + 1; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function dof(): 'gain' | 'lose' { return d(6) <= 3 ? 'lose' : 'gain'; }

function rollSkinColor(): string {
  const color = SKIN_COLORS[d(10) - 1];
  if (color === 'Polka-Dot') {
    const a = SKIN_COLORS[d(10) - 1];
    const b = SKIN_COLORS[d(10) - 1];
    return `Polka-Dot (${a} and ${b})`;
  }
  return color;
}

function generateMutation(): string {
  const roll = d(8);
  if (roll <= 2) {
    const direction = dof();
    const part = BODY_PARTS[d(10) - 1];
    return `${direction === 'gain' ? 'Gains' : 'Loses'} a ${part}.`;
  }
  if (roll === 3) {
    return `Skin color changes to ${rollSkinColor()}.`;
  }
  if (roll === 4) {
    const direction = dof();
    const inches = d(20);
    return `${direction === 'gain' ? 'Gains' : 'Loses'} ${inches} inch${inches === 1 ? '' : 'es'} of height.`;
  }
  if (roll === 5) {
    const direction = dof();
    const extremity = HAIR_EXTREMITIES[d(6) - 1];
    return `${direction === 'gain' ? 'Gains' : 'Loses'} hair on ${extremity}.`;
  }
  if (roll <= 7) {
    const wyrdRoll = d(20) + d(20);
    return `Wyrdness (${wyrdRoll}): ${WYRDNESS[wyrdRoll]}`;
  }
  return 'Becomes one of the Wretched.';
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
    mutation: generateMutation(),
  };
}

interface Props {
  onClose: () => void;
}

export function NPCModal({ onClose }: Props) {
  const [npc, setNpc] = useState(generateNPC);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = `#### ${npc.name}\nQuirk: ${npc.quirk}\nBackground: ${npc.background}\nGoal: ${npc.goal}\nVirtue: ${npc.virtue}\nVice: ${npc.vice}\nMutation: ${npc.mutation}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

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
          <Row label="Mutation" value={npc.mutation} wrap />
        </div>
        <div className={styles.footer}>
          <button className={styles.reroll} onClick={() => setNpc(generateNPC())}>
            Reroll
          </button>
          <button className={styles.copy} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, wrap }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className={`${styles.row} ${wrap ? styles.rowWrap : ''}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
