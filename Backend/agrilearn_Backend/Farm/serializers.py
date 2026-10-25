# conversion  to/from json
from rest_framework import serializers
from .models import FarmCycle

class CreateFarmCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmCycle
        fields = ['id', 'crop', 'mode', 'real_duration_hours', 'owner_type', 'student', 'group']
from .services import compute_Current_virtual_day

from .services import compute_Current_virtual_day, compute_active_seconds, duration_seconds

class FarmCycleStateSerializer(serializers.ModelSerializer):
    virtual_day = serializers.SerializerMethodField()
    virtual_week = serializers.SerializerMethodField()
    day_in_week = serializers.SerializerMethodField()
    total_days = serializers.SerializerMethodField()
    seconds_remaining = serializers.SerializerMethodField()

    class Meta:
        model = FarmCycle
        fields = ['id', 'crop', 'mode', 'status', 'current_health_score',
                  'current_health_state', 'is_paused', 'virtual_day', 'virtual_week',
                  'day_in_week', 'total_days', 'seconds_remaining']

    def get_virtual_day(self, obj):
        return round(compute_Current_virtual_day(obj), 2)

    def get_virtual_week(self, obj):
        return int(compute_Current_virtual_day(obj) // 7) + 1

    def get_day_in_week(self, obj):
        return int(compute_Current_virtual_day(obj) % 7) + 1

    def get_total_days(self, obj):
        return obj.crop.real_world_duration_days

    def get_seconds_remaining(self, obj):
        if obj.mode != 'Guided':
            return None
        return max(0, int(duration_seconds(obj) - compute_active_seconds(obj)))
class AvailableActionSerializer(serializers.Serializer):
    stage_id = serializers.IntegerField(source='stage.id')
    stage_name = serializers.CharField(source='stage.stage_name')
    order = serializers.IntegerField(source='stage.order')
    action_type = serializers.CharField(source='stage.action_type')
    earliest_virtual_date = serializers.IntegerField(source='stage.earliest_virtual_date')
    latest_virtual_date = serializers.IntegerField(source='stage.latest_virtual_date')
    enabled = serializers.BooleanField()
    time_ready = serializers.BooleanField()
    hint = serializers.CharField(allow_blank=True)
class SubmitActionSerializer(serializers.Serializer):
    stage_id = serializers.IntegerField()
    fertilizer_name = serializers.CharField(required=False, allow_blank=True)
    application_rate = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    row_spacing_cm = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, min_value=1, max_value=500)
    column_spacing_cm = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, min_value=1, max_value=500)
    seeds_per_hole = serializers.IntegerField(required=False, min_value=1, max_value=10)
        