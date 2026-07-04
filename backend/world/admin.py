from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError

from .utils import adjacent_hexes
from .models import (
    Map, Hex, PointOfInterest,
    Faction, ActiveDisease,
    Knowledge,
    Tick, HexTick, FactionTick,
    WorldSettings,
    Party,
)


@admin.register(WorldSettings)
class WorldSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not WorldSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.action(description='Enable fog of war')
def enable_fog_of_war(modeladmin, request, queryset):
    queryset.update(fog_of_war=True)

@admin.action(description='Disable fog of war')
def disable_fog_of_war(modeladmin, request, queryset):
    queryset.update(fog_of_war=False)

@admin.register(Map)
class MapAdmin(admin.ModelAdmin):
    list_display = ('name', 'map_type', 'current_tick', 'fog_of_war')
    actions = [enable_fog_of_war, disable_fog_of_war]


@admin.action(description='Mark selected hexes as player explored + visible')
def mark_explored_visible(modeladmin, request, queryset):
    queryset.update(player_explored=True, player_visible=True)

@admin.action(description='Mark selected hexes as player visible (not explored)')
def mark_visible(modeladmin, request, queryset):
    queryset.update(player_visible=True)

@admin.action(description='Clear player explored + visible')
def clear_explored_visible(modeladmin, request, queryset):
    queryset.update(player_explored=False, player_visible=False)

@admin.action(description='Mark adjacent hexes as player visible (not explored)')
def mark_adjacent_visible(modeladmin, request, queryset):
    selected = list(queryset)
    all_hexes = list(Hex.objects.filter(map__in=[h.map_id for h in selected]))
    adj_ids = set()
    for hex in selected:
        for adj in adjacent_hexes(hex, all_hexes):
            adj_ids.add(adj.id)
    Hex.objects.filter(id__in=adj_ids).update(player_visible=True)

class POIInline(admin.TabularInline):
    model = PointOfInterest
    extra = 0
    fields = ('poi_type', 'name', 'title', 'difficulty', 'hidden', 'player_visible', 'player_explored')
    show_change_link = True


@admin.register(Hex)
class HexAdmin(admin.ModelAdmin):
    list_display = ('map', 'row', 'col', 'terrain_type', 'resources', 'player_explored', 'player_visible')
    list_filter = ('map', 'terrain_type', 'player_explored', 'player_visible')
    search_fields = ('map__name', 'row', 'col')
    actions = [mark_explored_visible, mark_visible, clear_explored_visible, mark_adjacent_visible]
    inlines = [POIInline]

    _KEY_MAP = {'map': 'map__name__icontains', 'row': 'row', 'col': 'col'}

    def get_search_results(self, request, queryset, search_term):
        import re
        tokens = search_term.strip().split()
        kv, plain = {}, []
        for token in tokens:
            m = re.fullmatch(r'(\w+)=(.+)', token)
            if m and m.group(1) in self._KEY_MAP:
                kv[m.group(1)] = m.group(2)
            else:
                plain.append(token)

        filters = {}
        for key, val in kv.items():
            lookup = self._KEY_MAP[key]
            # row/col are integers — use exact match
            filters[lookup] = int(val) if key in ('row', 'col') else val
        if filters:
            queryset = queryset.filter(**filters)

        remaining = ' '.join(plain)
        if remaining:
            queryset, use_distinct = super().get_search_results(request, queryset, remaining)
        else:
            use_distinct = False

        return queryset, use_distinct


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
            'fields': ('name', 'is_mobile', 'is_player_faction', 'current_hex', 'destination', 'image'),
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


class POIMapFilter(admin.SimpleListFilter):
    title = 'map'
    parameter_name = 'map'

    def lookups(self, request, model_admin):
        maps = Map.objects.order_by('name')
        return [(m.pk, m.name) for m in maps]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(hex__map_id=self.value())
        return queryset


@admin.action(description='Set player visible')
def poi_set_player_visible(modeladmin, request, queryset):
    queryset.update(player_visible=True)

@admin.action(description='Clear player visible')
def poi_clear_player_visible(modeladmin, request, queryset):
    queryset.update(player_visible=False)

@admin.action(description='Set hidden')
def poi_set_hidden(modeladmin, request, queryset):
    queryset.update(hidden=True)

@admin.action(description='Clear hidden')
def poi_clear_hidden(modeladmin, request, queryset):
    queryset.update(hidden=False)


@admin.register(PointOfInterest)
class PointOfInterestAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'hex', 'poi_type', 'hidden', 'player_visible', 'player_explored')
    list_filter = (POIMapFilter, 'poi_type', 'hidden', 'player_visible', 'player_explored')
    search_fields = ('name', 'title', 'hex__map__name')
    actions = [poi_set_player_visible, poi_clear_player_visible, poi_set_hidden, poi_clear_hidden]
    fieldsets = (
        (None, {
            'fields': ('hex', 'poi_type', 'name', 'title', 'age'),
        }),
        ('Visibility', {
            'fields': ('hidden', 'player_visible', 'player_explored'),
        }),
        ('Details', {
            'fields': ('difficulty', 'description', 'notes', 'technology_max_modifier'),
        }),
        ('Relations', {
            'fields': ('faction', 'monster_type', 'knowledge'),
        }),
    )


@admin.register(Tick)
class TickAdmin(admin.ModelAdmin):
    list_display = ('number', 'created_at')
    ordering = ('-number',)


class HexTickInline(admin.TabularInline):
    model = HexTick
    extra = 0
    readonly_fields = ('hex', 'resources', 'encounter_likelihood', 'player_explored', 'player_visible')
    can_delete = False


class FactionTickInline(admin.TabularInline):
    model = FactionTick
    extra = 0
    readonly_fields = ('faction', 'population', 'resources', 'technology', 'combat_skill', 'action', 'dice_roll')
    can_delete = False


@admin.register(HexTick)
class HexTickAdmin(admin.ModelAdmin):
    list_display = ('tick', 'hex', 'resources')
    list_filter = ('tick',)
    readonly_fields = ('tick', 'hex', 'resources', 'encounter_likelihood', 'player_explored', 'player_visible')


@admin.register(FactionTick)
class FactionTickAdmin(admin.ModelAdmin):
    list_display = ('tick', 'faction', 'action', 'dice_roll', 'population', 'resources')
    list_filter = ('tick', 'action')
    readonly_fields = ('tick', 'faction', 'is_mobile', 'speed', 'population', 'technology',
                       'technology_max', 'resources', 'agreeableness', 'combat_skill',
                       'scouting', 'theology', 'famine_streak', 'current_hex', 'destination',
                       'action', 'dice_roll')


@admin.register(Knowledge)
class KnowledgeAdmin(admin.ModelAdmin):
    list_display = ('title', 'do_players_know')
    list_filter = ('do_players_know',)
    search_fields = ('title',)


class PartyAdminForm(forms.ModelForm):
    current_hex_row = forms.IntegerField(required=False, label='Current hex row')
    current_hex_col = forms.IntegerField(required=False, label='Current hex col')
    destination_row = forms.IntegerField(required=False, label='Destination row')
    destination_col = forms.IntegerField(required=False, label='Destination col')

    class Meta:
        model = Party
        exclude = ('current_hex', 'destination')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance.pk:
            if self.instance.current_hex:
                self.fields['current_hex_row'].initial = self.instance.current_hex.row
                self.fields['current_hex_col'].initial = self.instance.current_hex.col
            if self.instance.destination:
                self.fields['destination_row'].initial = self.instance.destination.row
                self.fields['destination_col'].initial = self.instance.destination.col

    def _lookup_hex(self, map_obj, row, col, field_label):
        try:
            return Hex.objects.get(map=map_obj, row=row, col=col)
        except Hex.DoesNotExist:
            raise ValidationError(f'{field_label}: no hex at row {row}, col {col} on this map.')

    def clean(self):
        cleaned = super().clean()
        map_obj = cleaned.get('map')
        row = cleaned.get('current_hex_row')
        col = cleaned.get('current_hex_col')
        dest_row = cleaned.get('destination_row')
        dest_col = cleaned.get('destination_col')

        if map_obj and row is not None and col is not None:
            cleaned['_current_hex'] = self._lookup_hex(map_obj, row, col, 'Current hex')
        else:
            cleaned['_current_hex'] = None

        if map_obj and dest_row is not None and dest_col is not None:
            cleaned['_destination'] = self._lookup_hex(map_obj, dest_row, dest_col, 'Destination')
        else:
            cleaned['_destination'] = None

        return cleaned


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    form = PartyAdminForm
    list_display = ('name', 'map', 'current_hex', 'current_action', 'last_action')
    fieldsets = (
        (None, {
            'fields': ('name', 'map', 'faction'),
        }),
        ('Stats', {
            'fields': ('speed', 'max_speed', 'resource_generation'),
        }),
        ('Location', {
            'fields': ('current_hex_row', 'current_hex_col', 'destination_row', 'destination_col'),
        }),
        ('Action', {
            'fields': ('current_action', 'last_action'),
        }),
    )

    def save_model(self, request, obj, form, change):
        obj.current_hex = form.cleaned_data['_current_hex']
        obj.destination = form.cleaned_data['_destination']
        super().save_model(request, obj, form, change)

