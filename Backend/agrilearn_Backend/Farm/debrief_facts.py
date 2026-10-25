"""
Farm/debrief_facts.py

Builds the facts payload for the end-of-cycle debrief AI.
Plain Python, no AI: everything here is read from what the engine already recorded.
The AI only explains this payload, so it can never contradict the health score.

Usage:
    from agrilearn_Backend.Farm.debrief_facts import build_debrief_facts
    facts = build_debrief_facts(cycle)   # JSON-serialisable dict
"""
from agrilearn_Backend.Farm.models import (
    CropNutrientRequirement,
    CycleEVent,
    FertlizerNutrientContent,
    PlantingRequirement,
    PlotHealthLog,
)

STARTING_HEALTH = 100


def _num(value):
    """Decimal -> float so the payload can go through json.dumps."""
    return float(value) if value is not None else None


def _timing_direction(event):
    stage = event.stage
    if event.virtual_date < stage.earliest_virtual_date:
        return 'early'
    if event.virtual_date > stage.latest_virtual_date:
        return 'late'
    return None


def _ideal_for_stage(stage):
    """The ideal range this stage was checked against, whether or not the student hit it."""
    if stage.action_type == 'FERTILIZER_APPLICATION':
        req = CropNutrientRequirement.objects.filter(stage=stage).first()
        if req:
            return {'effective_nutrient_min': _num(req.ideal_min),
                    'effective_nutrient_max': _num(req.ideal_max)}
    elif stage.action_type == 'SPACING_DECISION':
        req = PlantingRequirement.objects.filter(stage=stage).first()
        if req:
            return {'planting_area_min_cm2': _num(req.ideal_area_min_cm2),
                    'planting_area_max_cm2': _num(req.ideal_area_max_cm2)}
    elif stage.action_type == 'PLANTING':
        req = PlantingRequirement.objects.filter(stage=stage).first()
        if req:
            return {'seeds_per_hole_min': req.min_seeds_per_hole,
                    'seeds_per_hole_max': req.max_seeds_per_hole}
    return None


def _effective_nutrient(event):
    """Same calculation the engine uses, so the debrief can show it for correct actions too."""
    if event.fertilizer_used is None or not event.application_rate:
        return None
    content = FertlizerNutrientContent.objects.filter(fertilizer=event.fertilizer_used).first()
    if not content:
        return None
    return round(float(event.application_rate) * float(content.content_percent) / 100, 2)


def build_debrief_facts(cycle):
    if cycle.status == 'Active':
        raise ValueError("Cannot build a debrief for a cycle that is still active.")
    events = list(
        CycleEVent.objects.filter(cycle=cycle)
        .select_related('stage', 'fertilizer_used')
        .order_by('virtual_date', 'id')
    )
    logs = list(PlotHealthLog.objects.filter(cycle=cycle).order_by('virtual_day', 'id'))

    # Every penalty the engine logged, in order, plus an index by stage name.
    all_penalties = [p for log in logs for p in (log.penalties or [])]
    by_stage = {}
    for p in all_penalties:
        by_stage.setdefault(p['stage'], []).append(p)

    # ---- per-event facts -------------------------------------------------
    event_facts = []
    for e in events:
        s = e.stage
        penalties = [p for p in by_stage.get(s.stage_name, []) if p['type'] != 'missed_stage']
        event_facts.append({
            'stage': s.stage_name,
            'action_type': s.action_type,
            'is_optional': s.is_optional,
            'virtual_day': e.virtual_date,
            'timing_window': {'earliest_day': s.earliest_virtual_date,
                              'latest_day': s.latest_virtual_date},
            'on_time': e.was_on_time,
            'timing_direction': _timing_direction(e),
            'fertilizer': e.fertilizer_used.name if e.fertilizer_used else None,
            'application_rate': _num(e.application_rate),
            'effective_nutrient': _effective_nutrient(e),
            'decision_details': e.decision_details or {},
            'ideal': _ideal_for_stage(s),
            'penalties': penalties,
            'done_correctly': len(penalties) == 0,
        })

    # ---- stages never done ----------------------------------------------
    skipped_optional = [p for p in all_penalties if p['flag'] == 'skipped_optional_stage']
    ran_out_of_time = [p for p in all_penalties if p['flag'] == 'ran_out_of_time']

    # ---- score accounting -----------------------------------------------
    applied = [p for p in all_penalties if p.get('applied')]
    points_lost = -sum(p['points'] for p in applied)
    ranked = sorted(applied, key=lambda p: p['points'])  # most negative first

    # Guided: mistakes were recorded as feedback only. Show what they would have cost.
    feedback_only = [p for p in all_penalties
                     if not p.get('applied') and p['type'] != 'missed_stage']
    would_have_cost = -sum(p['points'] for p in feedback_only)

    final_score = _num(cycle.current_health_score)
    expected_score = max(0, STARTING_HEALTH - points_lost)

    return {
        'crop': getattr(cycle.crop, 'name', None) or str(cycle.crop),
        'mode': cycle.mode,                      # 'Guided' or 'Free'
        'status': cycle.status,                  # 'Completed' or 'Failed'
        'pace': {
            'virtual_days': cycle.crop.real_world_duration_days,
            'real_hours': _num(cycle.real_duration_hours),
        },
        'final_health': {'score': final_score, 'state': cycle.current_health_state},

        'events': event_facts,
        'went_well': [f['stage'] for f in event_facts if f['done_correctly']],

        'skipped_optional_stages': skipped_optional,   # Free only
        'ran_out_of_time_stages': ran_out_of_time,     # Guided only

        'points_lost_total': points_lost,
        'biggest_costs': ranked[:3],
        'feedback_only_mistakes': feedback_only,       # Guided only, no points taken
        'would_have_cost_in_free': would_have_cost,

        'health_arc': [{'day': l.virtual_day, 'score': _num(l.health_score),
                        'state': l.health_state} for l in logs],

        # For tests: False means the log and the cycle disagree (e.g. rows from before
        # the penalties field existed). Don't send a debrief if this is False.
        'reconciles': abs(final_score - expected_score) < 0.01,
    }