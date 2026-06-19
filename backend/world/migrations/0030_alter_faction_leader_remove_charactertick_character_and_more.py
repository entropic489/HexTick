from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('world', '0029_faction_allowed_hexes_faction_movement_restricted'),
    ]

    operations = [
        migrations.AlterField(
            model_name='faction',
            name='leader',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.RemoveField(
            model_name='party',
            name='characters',
        ),
        migrations.RemoveField(
            model_name='pointofinterest',
            name='items',
        ),
        migrations.DeleteModel(
            name='CharacterTick',
        ),
        migrations.DeleteModel(
            name='Character',
        ),
        migrations.DeleteModel(
            name='Item',
        ),
    ]
