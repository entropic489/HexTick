from django.contrib import admin

from .models import (
    Map, Hex,
    Faction, ActiveDisease,
    Tick, HexTick, FactionTick,
    WorldSettings,
)


@admin.register(WorldSettings)
class WorldSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not WorldSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


class HexInline(admin.TabularInline):
    model = Hex
    extra = 0
    fields = ('row', 'col', 'terrain_type', 'resources', 'weather', 'encounter_likelihood', 'player_explored', 'player_visible')


@admin.register(Map)
class MapAdmin(admin.ModelAdmin):
    list_display = ('name', 'hex_size', 'origin_x', 'origin_y')
    inlines = [HexInline]


@admin.register(Hex)
class HexAdmin(admin.ModelAdmin):
    list_display = ('map', 'row', 'col', 'terrain_type', 'resources', 'weather', 'player_explored')
    list_filter = ('map', 'terrain_type', 'weather', 'player_explored')
    search_fields = ('map__name',)


class ActiveDiseaseInline(admin.TabularInline):
    model = ActiveDisease
    extra = 0
    fields = ('disease_type', 'duration_days_remaining', 'effect_value')
    readonly_fields = ('effect_value',)


@admin.register(Faction)
class FactionAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_player_faction', 'population', 'resources', 'technology', 'combat_skill', 'current_hex')
    list_filter = ('is_player_faction', 'is_mobile')
    search_fields = ('name',)
    readonly_fields = ('last_action', 'famine_streak', 'population_trend_override')
    fieldsets = (
        (None, {
            'fields': ('name', 'is_mobile', 'is_player_faction', 'current_hex', 'destination'),
        }),
        ('Stats', {
            'fields': ('population', 'technology', 'technology_max', 'resources',
                       'agreeableness', 'combat_skill', 'scouting', 'theology', 'speed'),
        }),
        ('State', {
            'fields': ('current_action', 'last_action', 'famine_streak', 'population_trend_override'),
        }),
    )
    inlines = [ActiveDiseaseInline]


@admin.register(Tick)
class TickAdmin(admin.ModelAdmin):
    list_display = ('number', 'created_at')
    ordering = ('-number',)


class HexTickInline(admin.TabularInline):
    model = HexTick
    extra = 0
    readonly_fields = ('hex', 'terrain_type', 'resources', 'weather', 'encounter_likelihood', 'player_explored', 'player_visible')
    can_delete = False


class FactionTickInline(admin.TabularInline):
    model = FactionTick
    extra = 0
    readonly_fields = ('faction', 'population', 'resources', 'technology', 'combat_skill', 'action', 'dice_roll')
    can_delete = False


@admin.register(HexTick)
class HexTickAdmin(admin.ModelAdmin):
    list_display = ('tick', 'hex', 'resources', 'weather')
    list_filter = ('tick',)
    readonly_fields = ('tick', 'hex', 'terrain_type', 'resources', 'points_of_interest',
                       'weather', 'encounter_likelihood', 'player_explored', 'player_visible')


@admin.register(FactionTick)
class FactionTickAdmin(admin.ModelAdmin):
    list_display = ('tick', 'faction', 'action', 'dice_roll', 'population', 'resources')
    list_filter = ('tick', 'action')
    readonly_fields = ('tick', 'faction', 'is_mobile', 'speed', 'population', 'technology',
                       'technology_max', 'resources', 'agreeableness', 'combat_skill',
                       'scouting', 'theology', 'famine_streak', 'current_hex', 'destination',
                       'action', 'dice_roll')
