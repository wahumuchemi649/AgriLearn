# all the functions
from agrilearn_Backend.Farm.models import CropNutrientRequirement, Crops, CycleEVent, FertilizerOption, FertlizerNutrientContent, PlantingRequirement, PlotHealthLog, StageDefinition
from django.utils import timezone


def cropsAvailable():
    ## getting all the crops in our database
    All_crops=Crops.objects.filter().all()
    return All_crops

def crop_stages(crop):
    ##Get all the stages of a specific crop
    all_stages = StageDefinition.objects.filter(crop=crop)
    return all_stages
def get_available_actions(cycle):
    """
    Returns every not-yet-completed stage for this cycle, each annotated
    with whether it's currently actionable.
    """
    completed_stage_ids = CycleEVent.objects.filter(
        cycle=cycle
    ).values_list('stage_id', flat=True)

    remaining_stages = crop_stages(cycle.crop).exclude(
        id__in=completed_stage_ids
    ).order_by('order')

    next_required_stage = remaining_stages.first()

    result = []
    for stage in remaining_stages:
        is_enabled = (
            cycle.mode == 'Free'
            or (cycle.mode == 'Guided' and next_required_stage and stage.id == next_required_stage.id)
        )
        result.append({'stage': stage, 'enabled': is_enabled})

    return result
def is_action_allowed(cycle, stage_id):
    available = get_available_actions(cycle)
    return any(item['stage'].id == stage_id and item['enabled'] for item in available)
def record_action(cycle, stage_id, fertilizer_name=None, application_rate=None,
                   row_spacing_cm=None, column_spacing_cm=None, seeds_per_hole=None):

    stage = StageDefinition.objects.get(id=stage_id)

    virtual_day = int(compute_Current_virtual_day(cycle))

    was_on_time = stage.earliest_virtual_date <= virtual_day <= stage.latest_virtual_date

    fertilizer = None
    if fertilizer_name:
        fertilizer = FertilizerOption.objects.filter(name=fertilizer_name).first()

    decision_details = {}
    if row_spacing_cm is not None:
        decision_details['row_spacing_cm'] = float(row_spacing_cm)
    if column_spacing_cm is not None:
        decision_details['column_spacing_cm'] = float(column_spacing_cm)
    if seeds_per_hole is not None:
        decision_details['seeds_per_hole'] = int(seeds_per_hole)

    event = CycleEVent.objects.create(
        cycle=cycle,
        stage=stage,
        virtual_date=virtual_day,
        was_on_time=was_on_time,
        fertilizer_used=fertilizer,
        application_rate=application_rate,
        decision_details=decision_details,
    )

    # keep the cached field roughly in sync
    cycle.Current_virtual_day = virtual_day
    cycle.save(update_fields=['Current_virtual_day'])

    return event
"""
The system allows you to pause and continue later, 
 this is to compute the current virtual day based on the accumulated 
 active seconds and the real-world duration of the crop cycle.
"""
def compute_Current_virtual_day(cycle):
    total_active_seconds = cycle.accumulated_active_seconds

    if not cycle.is_paused and cycle.current_segment_start:
        elapsed = (timezone.now() - cycle.current_segment_start).total_seconds()
        total_active_seconds += elapsed

    compression_ratio = cycle.crop.real_world_duration_days / float(cycle.real_duration_hours)
    virtual_day = (total_active_seconds / 3600) * compression_ratio

    return virtual_day    


def apply_action_consequences(event):
    cycle = event.cycle
    stage = event.stage

    deltas = []
    stress_flags = []

    # 1. Timing — only penalize lateness, no bonus for being on time
    if not event.was_on_time:
        deltas.append(('timing', -15))
        stress_flags.append('missed_timing_window')

    # 2. Nutrient scoring — only penalize being wrong, no bonus for being right
    if stage.action_type == 'FERTILIZER_APPLICATION' and event.fertilizer_used:
        requirement = CropNutrientRequirement.objects.filter(stage=stage).first()
        content = FertlizerNutrientContent.objects.filter(fertilizer=event.fertilizer_used).first()

        if requirement and content and event.application_rate:
            effective_nitrogen = float(event.application_rate) * float(content.content_percent) / 100
            if effective_nitrogen < requirement.ideal_min:
                deltas.append(('nutrient', -10))
                stress_flags.append('under_fertilized')
            elif effective_nitrogen > requirement.ideal_max:
                deltas.append(('nutrient', -10))
                stress_flags.append('over_fertilized')
            # within range → no penalty, nothing appended
        else:
            deltas.append(('nutrient', -5))
            stress_flags.append('unrecognized_fertilizer')

    # 3. Spacing/seeds — same pattern, penalty only when outside range
    if stage.action_type == 'SPACING_DECISION' and event.decision_details:
        requirement = PlantingRequirement.objects.filter(stage=stage).first()
        details = event.decision_details
        if requirement and 'row_spacing_cm' in details and 'column_spacing_cm' in details:
            area = details['row_spacing_cm'] * details['column_spacing_cm']
            if not (requirement.ideal_area_min_cm2 <= area <= requirement.ideal_area_max_cm2):
                deltas.append(('spacing', -10))
                stress_flags.append('bad_spacing')

    if stage.action_type == 'PLANTING' and event.decision_details:
        requirement = PlantingRequirement.objects.filter(stage=stage).first()
        seeds = event.decision_details.get('seeds_per_hole')
        if requirement and seeds is not None:
            if not (requirement.min_seeds_per_hole <= seeds <= requirement.max_seeds_per_hole):
                deltas.append(('seeds', -5))
                stress_flags.append('bad_seed_count')

    # 4. Combine — same as before, just no positive deltas exist anymore
    total_delta = sum(points for _, points in deltas)
    new_score = max(0, min(100, float(cycle.current_health_score) + total_delta))

    cycle.current_health_score = new_score
    cycle.current_health_state = score_to_health_state(new_score)
    cycle.save(update_fields=['current_health_score', 'current_health_state'])

    PlotHealthLog.objects.create(
        cycle=cycle, virtual_day=event.virtual_date,
        health_score=new_score, health_state=cycle.current_health_state,
        stress_flags=stress_flags,
    )
    return new_score

def score_to_health_state(score):
    if score >= 85:
        return 'Thriving'
    if score >= 65:
        return 'Healthy'
    if score >= 40:
        return 'Stressed'
    if score >= 15:
        return 'Stunted'
    return 'Dead'
def is_cycle_complete(cycle):
    required_stage_ids = StageDefinition.objects.filter(
        crop=cycle.crop, is_optional=False
    ).values_list('id', flat=True)

    completed_stage_ids = CycleEVent.objects.filter(
        cycle=cycle
    ).values_list('stage_id', flat=True)

    return set(required_stage_ids).issubset(set(completed_stage_ids))

class ActionRejected(Exception):
    """Raised when a submitted action isn't currently allowed."""
    pass


def submit_action(cycle, stage_id, fertilizer_name=None, application_rate=None,
                   row_spacing_cm=None, column_spacing_cm=None, seeds_per_hole=None):

    if not is_action_allowed(cycle, stage_id):
        raise ActionRejected("This action is not currently available.")

    event = record_action(
        cycle=cycle,
        stage_id=stage_id,
        fertilizer_name=fertilizer_name,
        application_rate=application_rate,
        row_spacing_cm=row_spacing_cm,
        column_spacing_cm=column_spacing_cm,
        seeds_per_hole=seeds_per_hole,
    )

    new_score = apply_action_consequences(event)

    if is_cycle_complete(cycle):
        cycle.status = 'Completed'
        cycle.save(update_fields=['status'])

    return {
        'event': event,
        'new_health_score': new_score,
        'new_health_state': cycle.current_health_state,
    }