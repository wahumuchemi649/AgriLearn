# conversion  to/from json
from rest_framework import serializers
from .models import FarmCycle

class CreateFarmCycleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FarmCycle
        fields = ['id', 'crop', 'mode', 'real_duration_hours', 'owner_type', 'student', 'group']
from .services import compute_Current_virtual_day

class FarmCycleStateSerializer(serializers.ModelSerializer):
    virtual_day = serializers.SerializerMethodField()

    class Meta:
        model = FarmCycle
        fields = [
            'id', 'crop', 'mode', 'status',
            'current_health_score', 'current_health_state',
            'is_paused', 'virtual_day',
        ]

    def get_virtual_day(self, obj):
        return round(compute_Current_virtual_day(obj), 2)
class AvailableActionSerializer(serializers.Serializer):
    stage_id = serializers.IntegerField(source='stage.id')
    stage_name = serializers.CharField(source='stage.stage_name')
    order = serializers.IntegerField(source='stage.order')
    action_type = serializers.CharField(source='stage.action_type')
    earliest_virtual_date = serializers.IntegerField(source='stage.earliest_virtual_date')
    latest_virtual_date = serializers.IntegerField(source='stage.latest_virtual_date')
    enabled = serializers.BooleanField()
class SubmitActionSerializer(serializers.Serializer):
    stage_id = serializers.IntegerField()
    fertilizer_name = serializers.CharField(required=False, allow_blank=True)
    application_rate = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    row_spacing_cm = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, min_value=1, max_value=500)
    column_spacing_cm = serializers.DecimalField(max_digits=6, decimal_places=2, required=False, min_value=1, max_value=500)
    seeds_per_hole = serializers.IntegerField(required=False, min_value=1, max_value=10)
        