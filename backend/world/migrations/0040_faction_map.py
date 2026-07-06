from django.db import migrations, models
import django.db.models.deletion


def backfill_faction_map(apps, schema_editor):
    """Set each faction's new `map` FK from its current hex's map (M8)."""
    Faction = apps.get_model('world', 'Faction')
    for faction in Faction.objects.filter(map__isnull=True, current_hex__isnull=False).iterator():
        faction.map_id = faction.current_hex.map_id
        faction.save(update_fields=['map'])


class Migration(migrations.Migration):

    dependencies = [
        ('world', '0039_map_detail_image_map_reveal_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='faction',
            name='map',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='factions',
                to='world.map',
            ),
        ),
        migrations.RunPython(backfill_faction_map, migrations.RunPython.noop),
    ]
