import pytest

from world.actions import _apply_disease, _expire_disease
from world.models.faction import ActiveDisease, DiseaseType

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('disease_type,stat_attr', [
    (DiseaseType.THE_RUNS, 'combat_skill'),
    (DiseaseType.BAD_FOOD, 'scouting'),
    (DiseaseType.RESTLESS, 'scouting'),
])
def test_apply_then_expire_restores_original_stat(faction_factory, disease_type, stat_attr):
    faction = faction_factory(scouting=10, combat_skill=20)
    original = getattr(faction, stat_attr)

    _apply_disease(faction, disease_type)
    faction.refresh_from_db()
    disease = ActiveDisease.objects.get(faction=faction, disease_type=disease_type)

    _expire_disease(faction, disease)
    faction.refresh_from_db()

    assert getattr(faction, stat_attr) == original
    assert not ActiveDisease.objects.filter(faction=faction, disease_type=disease_type).exists()


def test_black_death_sets_and_clears_population_trend_override(faction_factory):
    faction = faction_factory(population=50)
    _apply_disease(faction, DiseaseType.BLACK_DEATH)
    faction.refresh_from_db()
    assert faction.population_trend_override == -5
    assert faction.population < 50  # population loss is not reversible on expiry

    disease = ActiveDisease.objects.get(faction=faction, disease_type=DiseaseType.BLACK_DEATH)
    lost_population = faction.population
    _expire_disease(faction, disease)
    faction.refresh_from_db()

    assert faction.population_trend_override is None
    assert faction.population == lost_population


def test_madness_reduces_population_and_is_not_reverted_on_expiry(faction_factory):
    faction = faction_factory(population=50, combat_skill=20)
    _apply_disease(faction, DiseaseType.MADNESS)
    faction.refresh_from_db()
    assert faction.population == 30  # population -= combat_skill

    disease = ActiveDisease.objects.get(faction=faction, disease_type=DiseaseType.MADNESS)
    _expire_disease(faction, disease)
    faction.refresh_from_db()
    assert faction.population == 30  # no revert branch for MADNESS in _expire_disease


def test_recontraction_before_expiry_reapplies_stat_effect(faction_factory):
    """Pins current (buggy per code-review.md M1) behavior: re-contracting an
    active disease re-applies its stat delta, but only the latest effect_value
    is stored, so a single expiry only reverts part of the total change."""
    faction = faction_factory(scouting=10)

    _apply_disease(faction, DiseaseType.RESTLESS)
    faction.refresh_from_db()
    after_first = faction.scouting

    _apply_disease(faction, DiseaseType.RESTLESS)
    faction.refresh_from_db()
    after_second = faction.scouting

    assert after_second > after_first  # stacked a second time instead of no-op

    disease = ActiveDisease.objects.get(faction=faction, disease_type=DiseaseType.RESTLESS)
    _expire_disease(faction, disease)
    faction.refresh_from_db()

    assert faction.scouting != 10  # does not cleanly return to the original value
