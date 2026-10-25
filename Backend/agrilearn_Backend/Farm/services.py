# all the functions
from agrilearn_Backend.Farm.models import CropNutrientRequirement, Crops, CycleEVent, FertilizerOption, FertlizerNutrientContent, PlantingRequirement, PlotHealthLog, StageDefinition
from django.utils import timezone
from agrilearn_Backend.Farm.models import (CropNutrientRequirement, Crops, CycleEVent, FarmCycle,
    FertilizerOption, FertlizerNutrientContent, PlantingRequirement, PlotHealthLog, StageDefinition)
from django.db import transaction
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
    finalize_if_time_up(cycle)
    virtual_day = compute_Current_virtual_day(cycle)

    completed_stage_ids = CycleEVent.objects.filter(cycle=cycle).values_list('stage_id', flat=True)
    remaining = crop_stages(cycle.crop).exclude(id__in=completed_stage_ids).order_by('order')
    next_stage = remaining.first()

    result = []
    for stage in remaining:
        if cycle.status != 'Active'  or cycle.is_paused:
            enabled = False
        elif cycle.mode == 'Free':
            enabled = True
        else:
            enabled = next_stage is not None and stage.id == next_stage.id
        time_ready = cycle.mode == 'Free' or virtual_day >= stage.earliest_virtual_date
        result.append({
            'stage': stage,
            'enabled': enabled,
            'time_ready': time_ready,
            'hint': '' if time_ready else not_yet_message(stage),
        })
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
HEALTH_PENALTIES_ENABLED = False  # flip to True when the health engine is applied


def compute_active_seconds(cycle):
    total = cycle.accumulated_active_seconds
    if not cycle.is_paused and cycle.current_segment_start:
        total += (timezone.now() - cycle.current_segment_start).total_seconds()
    return total


def duration_seconds(cycle):
    return int(float(cycle.real_duration_hours) * 3600)


def compute_Current_virtual_day(cycle):
    active = compute_active_seconds(cycle)
    if cycle.mode == 'Guided':
        active = min(active, duration_seconds(cycle))  # never runs past the chosen duration
    ratio = cycle.crop.real_world_duration_days / float(cycle.real_duration_hours)
    return (active / 3600) * ratio
def pause_cycle(cycle):
    with transaction.atomic():
        cycle = FarmCycle.objects.select_for_update().get(pk=cycle.pk)
        finalize_if_time_up(cycle)  # time may have just run out
        if cycle.status != 'Active':
            raise ActionRejected('Only a running cycle can be paused.')
        if cycle.is_paused:
            return cycle
        freeze_clock(cycle)
        cycle.save(update_fields=['accumulated_active_seconds', 'is_paused',
                                  'current_segment_start'])
    return cycle


def resume_cycle(cycle):
    with transaction.atomic():
        cycle = FarmCycle.objects.select_for_update().get(pk=cycle.pk)
        if cycle.status != 'Active':
            raise ActionRejected('This cycle has ended and cannot be resumed.')
        if not cycle.is_paused:
            return cycle
        cycle.is_paused = False
        cycle.current_segment_start = timezone.now()
        cycle.save(update_fields=['is_paused', 'current_segment_start'])
    return cycle

def freeze_clock(cycle, active_seconds=None):
    cycle.accumulated_active_seconds = int(
        compute_active_seconds(cycle) if active_seconds is None else active_seconds
    )
    cycle.is_paused = True
    cycle.current_segment_start = None
    
MISSED_OPTIONAL_PENALTY = -5  # Free mode only

def apply_missed_stage_penalties(cycle):
    """Run once, when the cycle ends. Logs every stage that was never done."""
    done_ids = set(CycleEVent.objects.filter(cycle=cycle).values_list('stage_id', flat=True))
    missed = crop_stages(cycle.crop).exclude(id__in=done_ids).order_by('order')
    if not missed.exists():
        return float(cycle.current_health_score)

    day = int(min(compute_Current_virtual_day(cycle), cycle.crop.real_world_duration_days))
    penalties = []

    for stage in missed:
        if cycle.mode == 'Guided':
            # Can't be skipped in Guided, so this only happens when time runs out.
            penalties.append({
                'type': 'missed_stage', 'points': 0, 'applied': False,
                'flag': 'ran_out_of_time',
                'expected': 'completed in the guided sequence',
                'actual': 'not reached before time ran out',
                'direction': None, 'stage': stage.stage_name, 'virtual_day': day,
            })
        elif stage.is_optional:
            penalties.append({
                'type': 'missed_stage', 'points': MISSED_OPTIONAL_PENALTY, 'applied': True,
                'flag': 'skipped_optional_stage',
                'expected': 'done (optional but recommended)', 'actual': 'never done',
                'direction': None, 'stage': stage.stage_name, 'virtual_day': day,
            })
        # Free + required can't be missed: the cycle only ends once they're done.

    if not penalties:
        return float(cycle.current_health_score)

    total = sum(p['points'] for p in penalties if p['applied'])
    new_score = max(0, min(100, float(cycle.current_health_score) + total))
    cycle.current_health_score = new_score
    cycle.current_health_state = score_to_health_state(new_score)
    cycle.save(update_fields=['current_health_score', 'current_health_state'])

    PlotHealthLog.objects.create(
        cycle=cycle, virtual_day=day,
        health_score=new_score, health_state=cycle.current_health_state,
        stress_flags=[p['flag'] for p in penalties],
        penalties=penalties,
    )
    return new_score

def finalize_if_time_up(cycle):
    """Guided only: end the cycle exactly when the chosen duration is used up."""
    if cycle.mode != 'Guided' or cycle.status != 'Active':
        return cycle
    limit = duration_seconds(cycle)
    if compute_active_seconds(cycle) >= limit:
        freeze_clock(cycle, active_seconds=limit)
        cycle.Current_virtual_day = cycle.crop.real_world_duration_days
        apply_missed_stage_penalties(cycle)  
        cycle.status = 'Completed' if is_cycle_complete(cycle) else 'Failed'
        cycle.save(update_fields=['accumulated_active_seconds', 'is_paused',
                                  'current_segment_start', 'Current_virtual_day', 'status'])
    return cycle


def not_yet_message(stage):
    opens = stage.earliest_virtual_date
    week = int(opens // 7) + 1
    if stage.timing_hint:
        return f"{stage.timing_hint} It opens in week {week} (day {opens})."
    return f"Not yet. {stage.stage_name} opens in week {week} (day {opens})."  


def apply_action_consequences(event):
    cycle = event.cycle
    stage = event.stage
    penalties = []

    def add(kind, points, flag, expected, actual, direction=None):
        penalties.append({
            'type': kind, 'points': points, 'flag': flag,
            'expected': expected, 'actual': actual, 'direction': direction,
            'stage': stage.stage_name, 'virtual_day': event.virtual_date,
        })

    # 1. Timing
    if not event.was_on_time:
        direction = 'early' if event.virtual_date < stage.earliest_virtual_date else 'late'
        add('timing', -15, 'missed_timing_window',
            {'earliest_day': stage.earliest_virtual_date, 'latest_day': stage.latest_virtual_date},
            event.virtual_date, direction)

    # 2. Fertiliser
    if stage.action_type == 'FERTILIZER_APPLICATION':
        if event.fertilizer_used is None:
            add('nutrient', -5, 'unrecognized_fertilizer', None, None)
        else:
            requirement = CropNutrientRequirement.objects.filter(stage=stage).first()
            content = FertlizerNutrientContent.objects.filter(fertilizer=event.fertilizer_used).first()
            if requirement and content and event.application_rate:
                n = float(event.application_rate) * float(content.content_percent) / 100
                band = {'min': float(requirement.ideal_min), 'max': float(requirement.ideal_max)}
                if n < band['min']:
                    add('nutrient', -10, 'under_fertilized', band, round(n, 2), 'low')
                elif n > band['max']:
                    add('nutrient', -10, 'over_fertilized', band, round(n, 2), 'high')

    # 3. Spacing and seeds
    details = event.decision_details or {}
    requirement = None
    if stage.action_type in ('SPACING_DECISION', 'PLANTING'):
        requirement = PlantingRequirement.objects.filter(stage=stage).first()

    if requirement and stage.action_type == 'SPACING_DECISION' \
            and 'row_spacing_cm' in details and 'column_spacing_cm' in details:
        area = details['row_spacing_cm'] * details['column_spacing_cm']
        lo, hi = requirement.ideal_area_min_cm2, requirement.ideal_area_max_cm2
        if not (lo <= area <= hi):
            add('spacing', -10, 'bad_spacing',
                {'min': float(lo), 'max': float(hi)}, area,
                'too_close' if area < lo else 'too_wide')

    if requirement and stage.action_type == 'PLANTING' and 'seeds_per_hole' in details:
        seeds = details['seeds_per_hole']
        lo, hi = requirement.min_seeds_per_hole, requirement.max_seeds_per_hole
        if not (lo <= seeds <= hi):
            add('seeds', -5, 'bad_seed_count', {'min': lo, 'max': hi}, seeds,
                'too_few' if seeds < lo else 'too_many')

    # 4. Apply. Guided records feedback only; Free changes health.
    applied = cycle.mode == 'Free'
    for p in penalties:
        p['applied'] = applied
    total = sum(p['points'] for p in penalties) if applied else 0
    new_score = max(0, min(100, float(cycle.current_health_score) + total))

    cycle.current_health_score = new_score
    cycle.current_health_state = score_to_health_state(new_score)
    cycle.save(update_fields=['current_health_score', 'current_health_state'])

    PlotHealthLog.objects.create(
        cycle=cycle, virtual_day=event.virtual_date,
        health_score=new_score, health_state=cycle.current_health_state,
        stress_flags=[p['flag'] for p in penalties],
        penalties=penalties,
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

    finalize_if_time_up(cycle)
    if cycle.status != 'Active':
        raise ActionRejected("This cycle has ended.")
    if cycle.is_paused:
        raise ActionRejected("The cycle is paused. Continue it first.")

    if not is_action_allowed(cycle, stage_id):
        raise ActionRejected("This action is not currently available.")

    if cycle.mode == 'Guided':
        stage = StageDefinition.objects.get(id=stage_id)
        if compute_Current_virtual_day(cycle) < stage.earliest_virtual_date:
            raise ActionRejected(not_yet_message(stage))

    event = record_action(cycle=cycle, stage_id=stage_id, fertilizer_name=fertilizer_name,
                          application_rate=application_rate, row_spacing_cm=row_spacing_cm,
                          column_spacing_cm=column_spacing_cm, seeds_per_hole=seeds_per_hole)
    new_score = apply_action_consequences(event)

    if cycle.mode == 'Free' and is_cycle_complete(cycle):
        new_score = apply_missed_stage_penalties(cycle)   # <-- new
        freeze_clock(cycle)
        cycle.status = 'Completed'
        cycle.save(update_fields=['accumulated_active_seconds', 'is_paused',
                                  'current_segment_start', 'status'])

    return {'event': event, 'new_health_score': new_score,
            'new_health_state': cycle.current_health_state}