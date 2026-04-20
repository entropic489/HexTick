import random
from dataclasses import dataclass

from .models.faction import Faction, FactionAction, DiseaseType, ActiveDisease
from .models.hex import Hex
from .models.ticks import Tick, HexTick, FactionTick
from .models.settings import WorldSettings
from .utils import modifier, hex_distance

HEX_RESOURCE_TICK_MODIFIER = 5


@dataclass
class ActionResult:
    action: FactionAction
    dice_roll: int | None = None
    success: bool = True
    notes: str = ''


# --- Faction tick ---

def _select_action(
    faction: Faction,
    nearby_factions: list[Faction],
    candidate_hexes: list[Hex],
) -> ActionResult:
    hex = faction.current_hex

    # GM-set destination: steer around disagreeable factions on the current hex
    if faction.destination:
        blocking = [
            f for f in nearby_factions
            if f.current_hex == faction.current_hex
            and f.agreeableness < 50
            and faction.last_action != FactionAction.BATTLE
        ]
        if blocking:
            detour = min(
                (h for h in candidate_hexes if all(f.current_hex != h for f in blocking)),
                key=lambda h: hex_distance(h, faction.destination),
                default=None,
            )
            if detour:
                return travel(faction, detour)
        return travel(faction, faction.destination)

    # Resolve nearest faction within scouting range
    in_range = [
        f for f in nearby_factions
        if f.current_hex and hex_distance(hex, f.current_hex) <= faction.scouting
    ]
    if in_range:
        closest = min(in_range, key=lambda f: hex_distance(hex, f.current_hex))
        outmatched = faction.combat_skill < closest.combat_skill
        if faction.last_action != FactionAction.BATTLE and faction.agreeableness < 50:
            if faction.current_hex == closest.current_hex:
                return battle(faction, closest)
            else:
                faction.destination = closest.current_hex
                return travel(faction, closest.current_hex)
        if outmatched:
            best = max(
                candidate_hexes,
                key=lambda h: h.resources - h.terrain_difficulty
                              + hex_distance(h, closest.current_hex),
                default=None,
            )
            if best:
                return travel(faction, best)
        elif faction.agreeableness < 0 and faction.combat_skill >= closest.combat_skill:
            return battle(faction, closest)
        elif closest.agreeableness >= 0 and faction.last_action != FactionAction.TRADE:
            return trade(faction, closest)
        else:
            return battle(faction, closest)

    # Stay and supply if the hex is comfortable; travel if not
    if hex:
        if faction.comfort(hex.resources) >= 0:
            return supply(faction, hex)
        else:
            best = min(
                candidate_hexes,
                key=lambda h: h.terrain_difficulty - h.resources,
                default=None,
            )
            if best:
                return travel(faction, best)

    # Delve if there's a dungeon, resources cover next round, and theology check passes
    dungeon = next((p for p in (hex.points_of_interest or []) if isinstance(p, dict) and p.get('type') == 'dungeon'), None)
    if dungeon and faction.resources > faction.population:
        if random.randint(1, 12) - modifier(faction.theology) >= 9:
            return delve(faction, dungeon.get('difficulty', 10))

    # Craft or train based on tech headroom
    if faction.resources > faction.population and (faction.technology_max - faction.technology) > 10:
        return craft(faction)

    return train(faction)


def tick_faction(
    faction: Faction,
    tick: Tick,
    nearby_factions: list[Faction],
    candidate_hexes: list[Hex],
) -> FactionTick:
    if not faction.is_player_faction and not faction.is_gm_faction:
        result = _select_action(faction, nearby_factions, candidate_hexes)
        faction.last_action = faction.current_action
        faction.current_action = result.action
    else:
        result = ActionResult(action=faction.current_action)
        faction.last_action = faction.current_action

    # Daily: every 3rd tick
    if tick.number % 3 == 0:
        faction.speed = faction.max_speed
        if faction.resources > 0:
            consumption = modifier(faction.population)
            if faction.diseases.filter(disease_type=DiseaseType.RAVENOUS).exists():
                consumption = int(consumption * 1.5)
            faction.resources = max(0, faction.resources - consumption)
        if faction.resources == 0:
            faction.famine_streak += 1
        else:
            faction.famine_streak = 0

    # Weekly: every 21st tick
    if tick.number % 21 == 0:
        roll = random.randint(1, 20) + faction.population_trend
        if roll <= 1:
            faction.population -= 2
        elif roll <= 3:
            faction.population -= 1
        elif roll >= 20:
            faction.population += 2
        elif roll >= 18:
            faction.population += 1

    faction.save()
    apply_diseases(faction)

    return FactionTick.objects.create(
        tick=tick,
        faction=faction,
        is_mobile=faction.is_mobile,
        speed=faction.speed,
        population=faction.population,
        technology=faction.technology,
        technology_max=faction.technology_max,
        resources=faction.resources,
        agreeableness=faction.agreeableness,
        combat_skill=faction.combat_skill,
        scouting=faction.scouting,
        theology=faction.theology,
        famine_streak=faction.famine_streak,
        current_hex=faction.current_hex,
        destination=faction.destination,
        action=result.action,
        dice_roll=result.dice_roll,
    )


# --- Hex ---

def tick_hex(hex: Hex, tick: Tick) -> HexTick:
    hex.resources += hex.resource_generation * HEX_RESOURCE_TICK_MODIFIER
    hex.save()
    return HexTick.objects.create(
        tick=tick,
        hex=hex,
        terrain_type=hex.terrain_type,
        resources=hex.resources,
        points_of_interest=hex.points_of_interest,
        weather=hex.weather,
        encounter_likelihood=hex.encounter_likelihood,
        player_explored=hex.player_explored,
        player_visible=hex.player_visible,
    )


# --- Faction ---

def supply(faction: Faction, hex: Hex) -> ActionResult:
    amount = min(faction.resource_generation, hex.resources)
    faction.resources += amount
    hex.resources -= modifier(faction.resource_generation)
    faction.save()
    hex.save()
    return ActionResult(action=FactionAction.SUPPLY, notes=f"+{amount} resources")


def _roll_disease() -> DiseaseType:
    roll = random.randint(1, 20)
    if roll == 1:
        return DiseaseType.MADNESS
    elif roll == 2:
        return DiseaseType.BLACK_DEATH
    elif roll <= 5:
        return DiseaseType.THE_RUNS
    elif roll <= 10:
        return DiseaseType.RAVENOUS
    elif roll <= 15:
        return DiseaseType.BAD_FOOD
    else:
        return DiseaseType.RESTLESS


def _apply_disease(faction: Faction, disease_type: DiseaseType) -> str:
    duration = random.randint(1, 6) + random.randint(1, 6)
    effect_value = 0

    if disease_type == DiseaseType.MADNESS:
        faction.population -= faction.combat_skill
        faction.save()

    elif disease_type == DiseaseType.BLACK_DEATH:
        lost = random.randint(1, 12)
        faction.population -= lost
        faction.population_trend_override = -5
        faction.save()
        effect_value = lost

    elif disease_type == DiseaseType.THE_RUNS:
        effect_value = random.randint(1, 12)
        faction.combat_skill -= effect_value
        faction.save()

    elif disease_type == DiseaseType.BAD_FOOD:
        effect_value = faction.scouting // 2
        faction.scouting -= effect_value
        faction.save()
        # speed is halved each tick via apply_diseases since it resets to max_speed

    elif disease_type == DiseaseType.RESTLESS:
        effect_value = int(faction.scouting * 0.5)
        faction.scouting += effect_value
        faction.save()

    ActiveDisease.objects.update_or_create(
        faction=faction,
        disease_type=disease_type,
        defaults={'duration_days_remaining': duration, 'effect_value': effect_value},
    )
    return f"contracted {disease_type.label} for {duration} days"


def _expire_disease(faction: Faction, disease: ActiveDisease) -> None:
    dt = disease.disease_type

    if dt == DiseaseType.BLACK_DEATH:
        faction.population_trend_override = None
        faction.save()

    elif dt == DiseaseType.THE_RUNS:
        faction.combat_skill += disease.effect_value
        faction.save()

    elif dt == DiseaseType.BAD_FOOD:
        faction.scouting += disease.effect_value
        faction.save()

    elif dt == DiseaseType.RESTLESS:
        faction.scouting -= disease.effect_value
        faction.save()

    disease.delete()


def apply_diseases(faction: Faction) -> None:
    """Apply per-tick disease effects and expire finished diseases. Call after speed reset."""
    for disease in faction.diseases.all():
        if disease.disease_type == DiseaseType.BAD_FOOD:
            faction.speed = faction.speed // 2
            faction.save()

        disease.duration_days_remaining -= 1
        if disease.duration_days_remaining <= 0:
            _expire_disease(faction, disease)
        else:
            disease.save()


def random_encounter(faction: Faction, hex: Hex) -> str:
    roll = random.randint(1, 20) + hex.encounter_likelihood
    if roll <= 1:
        disease = _roll_disease()
        return _apply_disease(faction, disease)
    elif roll <= 5:
        difficulty = roll - 1
        return f"monster encounter (difficulty {difficulty})"
    elif roll <= 17:
        return ""
    elif roll == 18:
        if faction.resources >= faction.technology:
            faction.resources -= 5
            faction.technology += 10
        else:
            faction.technology -= 5
            faction.resources += 10
        faction.save()
        return "beneficial trade encounter"
    elif roll == 19:
        gained = random.randint(1, 6)
        faction.population += gained
        faction.save()
        return f"found wanderers: +{gained} population"
    else:
        gained = random.randint(1, 20)
        faction.resources += gained
        faction.save()
        return f"found resources: +{gained}"


def travel(faction: Faction, destination: Hex) -> ActionResult:
    cost = destination.terrain_difficulty
    faction.speed -= cost
    faction.current_hex = destination
    faction.save()
    encounter_note = random_encounter(faction, destination)
    notes = f"moved to {destination} (cost {cost})"
    if encounter_note:
        notes += f"; {encounter_note}"
    return ActionResult(action=FactionAction.TRAVEL, notes=notes)


def trade(faction: Faction, other: Faction) -> ActionResult:
    amount = WorldSettings.get().trade_amount
    offer_resources = faction.resources >= faction.technology
    if offer_resources:
        faction.resources -= amount
        faction.technology += amount
        other.resources += amount
        other.technology -= amount
    else:
        faction.technology -= amount
        faction.resources += amount
        other.technology += amount
        other.resources -= amount

    # Higher population influences the other's theology toward their own
    dominant, influenced = (faction, other) if faction.population >= other.population else (other, faction)
    theo_mod = modifier(dominant.theology)
    if dominant.theology > influenced.theology:
        influenced.theology = min(influenced.theology + theo_mod, dominant.theology)
    elif dominant.theology < influenced.theology:
        influenced.theology = max(influenced.theology - theo_mod, dominant.theology)

    faction.save()
    other.save()
    return ActionResult(action=FactionAction.TRADE)


def merge(faction: Faction, other: Faction) -> ActionResult:
    """Absorb other into faction."""
    faction.population += other.population
    faction.resources += other.resources
    other.population = 0
    other.save()
    faction.save()
    return ActionResult(action=FactionAction.MERGE, notes=f"absorbed {other}")


def battle(faction: Faction, other: Faction) -> ActionResult:
    if other.current_action == FactionAction.TRAVEL:
        damage = faction.combat_skill // 2
        other.population -= damage
        other.speed += 3
        other.save()
        return ActionResult(
            action=FactionAction.BATTLE,
            success=True,
            notes=f"{other} was traveling: took {damage} population damage, gained 3 speed",
        )

    faction_roll = random.randint(1, 20) + faction.combat_skill
    other_roll = random.randint(1, 20) + other.combat_skill

    if faction_roll >= other_roll:
        winner, loser = faction, other
    else:
        winner, loser = other, faction

    loser.population -= winner.combat_skill
    winner.combat_skill -= loser.combat_skill // 2
    winner.resources += winner.combat_skill

    winner.save()
    loser.save()

    won = winner == faction
    return ActionResult(
        action=FactionAction.BATTLE,
        dice_roll=faction_roll,
        success=won,
        notes=f"{'won' if won else 'lost'} vs {other}",
    )


def train(faction: Faction) -> ActionResult:
    roll = random.randint(1, 6)
    faction.combat_skill = min(faction.combat_skill + roll, faction.combat_skill_max)
    faction.save()
    return ActionResult(action=FactionAction.TRAIN, dice_roll=roll, notes=f"+{roll} combat_skill")


def craft(faction: Faction) -> ActionResult:
    roll = random.randint(1, 6)
    faction.technology = min(faction.technology + roll, faction.technology_max)
    faction.save()
    return ActionResult(action=FactionAction.CRAFT, dice_roll=roll, notes=f"+{roll} technology")


def delve(faction: Faction, dungeon_difficulty: int) -> ActionResult:
    roll = random.randint(1, 20)
    total = roll + modifier(faction.combat_skill)
    success = total >= dungeon_difficulty
    faction.theology = max(0, faction.theology - 5)
    if success:
        faction.technology_max += 1
    faction.save()
    return ActionResult(
        action=FactionAction.DELVE,
        dice_roll=roll,
        success=success,
        notes=f"rolled {total} vs difficulty {dungeon_difficulty}",
    )
