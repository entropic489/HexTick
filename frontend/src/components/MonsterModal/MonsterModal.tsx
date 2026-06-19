import { useState } from 'react';
import styles from './MonsterModal.module.css';

const PHYSIQUE = ['Albino','Black','Crystalline','Emaciated','Eyeless','Feathered','Gelatinous','Glowing','Hardened','Headless','Horned','Hunched','Iridescent','Polyocular','Scaled','Segmented','Skeletal','Slimy','Translucent','Twisted'];
const FEATURE = ['Antennae','Beak','Carapace','Claws','Fangs','Feathers','Fur','Gilled','Horns','Markings','Scales','Shell','Snout','Tail','Talons','Tentacles','Trunk','Tusks','Voice','Wings'];
const QUIRKS = ['Alters Its Size at Will','Changes Color at Will','Collects Rare Flowers','Collects Trophies','Does Not Die of Old Age','Draws Symbols','Fascinated by Fire','Hoards Books','Loves a Specific Color','Reborn Each Day','Loves Shiny Objects','Mimics Voices','Moves in a Straight Line','Narrates Everything','Obsessively Cleans','Plants Grow in Its Wake','Sleeps Upside Down','Speaks in Rhymes','Sweats Rare Minerals','Reproduces Asexually'];
const WEAKNESS = ['Alcohol','Cold','Conversation','Flattery','Games','Gifts','Iron','Loud Noises','Mirrors','Bright Colors','Moonlight','Music','Prepared Meals','Puzzles','Religious Icons','Salt','Silver','Sunlight','True Name','Weak Spot'];
const ATTACK_TYPE = ['Bites','Blunts','Burns','Freezes','Gases','Kicks','Punches','Shoots','Slams','Slashes','Slices','Smashes','Sprays','Squeezes','Stabs','Stings','Throws','Touches','Whips','Zaps'];
const CRIT_DAMAGE = ['Asphyxiates','Bleeds','Blinds','Breaks','Crushes','Decays','Dissolves','Ensnares','Explodes','Grapples','Incapacitates','Lacerates','Liquefies','Paralyzes','Petrifies','Poisons','Punctures','Severs','Tramples','Weakens'];
const ABILITY = ['Absorbs','Amplifies','Attracts','Binds','Camouflages','Conjures','Controls','Disables','Duplicates','Grows','Manipulates','Reflects','Regenerates','Resists','Reverses','Shapes','Shrinks','Transforms','Traps','Zaps'];
const ABILITY_TARGET = ['Body','Dreams','Element','Emotions','Energy','Health','Hearing','Illusions','Light','Memory','Metal','Plants','Spirit','Stone','Surroundings','Time','Vision','Water','Weather','Weakens'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function generateMonster() {
  return {
    physique: pick(PHYSIQUE),
    feature: pick(FEATURE),
    quirk: pick(QUIRKS),
    weakness: pick(WEAKNESS),
    attack: pick(ATTACK_TYPE),
    critDamage: pick(CRIT_DAMAGE),
    ability: pick(ABILITY),
    abilityTarget: pick(ABILITY_TARGET),
  };
}

interface Props {
  onClose: () => void;
}

export function MonsterModal({ onClose }: Props) {
  const [monster, setMonster] = useState(generateMonster);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = [
      `Appearance: ${monster.physique} + ${monster.feature}.`,
      `Traits: ${monster.quirk} + ${monster.weakness}`,
      `Attack: ${monster.attack} + ${monster.critDamage}`,
      `Abilities: ${monster.ability} + ${monster.abilityTarget}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.name}>Monster</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          <Row label="Physique" value={monster.physique} />
          <Row label="Feature" value={monster.feature} />
          <Row label="Quirk" value={monster.quirk} />
          <Row label="Weakness" value={monster.weakness} />
          <Row label="Attack" value={monster.attack} />
          <Row label="Critical" value={monster.critDamage} />
          <Row label="Ability" value={`${monster.ability} ${monster.abilityTarget}`} />
        </div>
        <div className={styles.footer}>
          <button className={styles.reroll} onClick={() => setMonster(generateMonster())}>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
