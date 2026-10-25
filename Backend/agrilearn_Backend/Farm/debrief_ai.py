"""
Farm/debrief_ai.py

Turns the facts dict from build_debrief_facts() into a student-friendly debrief.

    from agrilearn_Backend.Farm.debrief_facts import build_debrief_facts
    from agrilearn_Backend.Farm.debrief_ai import generate_debrief

    debrief = generate_debrief(build_debrief_facts(cycle))
    debrief['source']   # 'ai' or 'template'

The AI never scores anything. It only explains the facts. If the API is unavailable
or returns something unusable, the template fallback builds the same JSON shape
from the same facts, so the student always gets a debrief (and it works offline).

Setup:  pip install anthropic
        ANTHROPIC_API_KEY=...   in Backend/.env (loaded into the environment)
        DEBRIEF_MODEL=...       optional, defaults to claude-sonnet-5-5
"""
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

DEBRIEF_MODEL = os.environ.get('DEBRIEF_MODEL', 'claude-sonnet-5-5')

# --------------------------------------------------------------------------
# Prompt
# --------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a friendly agriculture teacher writing an end-of-cycle debrief for a \
Kenyan student who just finished a virtual farming cycle in AgriLearn Kenya. Students are in \
the Competency-Based Curriculum (CBC), so keep the language simple: short sentences, no jargon, \
and explain any farming word you use. Use Kenyan farming context where it fits naturally \
(for example the long rains, maize as a staple crop), but never invent facts about this student's farm.

You are given a FACTS object produced by the game's scoring engine. Rules:

1. Explain only what is in FACTS. Do not invent causes, weather, pests, diseases or events. \
This farm has no randomness: every point lost came from a decision the student made.
2. Never change, recalculate or question the scores. Quote numbers exactly as given. \
Do not state units for fertiliser amounts, because the units are not provided.
3. For each mistake, say what the student did, what the ideal was, and why that matters for the \
crop in one or two plain sentences. Use the stage's timing_direction (early or late) when it is given.
4. Cover what went well, not only what went wrong. Use went_well and any events with no penalties.
5. Finish with 2 or 3 concrete things to do differently next cycle.
6. Be encouraging and honest. Do not praise mistakes and do not scold.

Mode rules:
- Guided mode: health never changes and stays at its starting value. Mistakes are feedback only. \
Never say the student lost points. If would_have_cost_in_free is above 0, you may say the mistakes \
would have cost that many health points in Free mode. If ran_out_of_time_stages is not empty, the \
student ran out of time: talk about pace and which stages were not reached, not about mistakes.
- Free mode: explain where the points went. Lead with the largest items in biggest_costs. \
If skipped_optional_stages is not empty, say which optional stages were skipped and that each cost \
points. If final_health.state is Dead or Stunted, make the biggest costs the main story.

Reply with ONLY a JSON object, no other text, in exactly this shape:
{
  "summary": "2-3 sentence overview of how the cycle went and the final health state",
  "key_moments": [
    {"stage": "exact stage name from FACTS", "what_happened": "...", "ideal": "...", "why_it_matters": "..."}
  ],
  "went_well": ["short sentence", "..."],
  "improve": ["short sentence", "..."],
  "next_time": ["one concrete action", "one concrete action"]
}
key_moments lists only stages that had a mistake, largest cost first. If there were none, use an empty list."""


def build_user_message(facts):
    return "FACTS:\n" + json.dumps(facts, indent=2, default=str)


# --------------------------------------------------------------------------
# Claude call (patch _call_claude in tests)
# --------------------------------------------------------------------------

def _call_claude(facts):
    import anthropic  # imported here so the fallback works without the package

    client = anthropic.Anthropic(timeout=30.0, max_retries=1)  # reads ANTHROPIC_API_KEY
    response = client.messages.create(
        model=DEBRIEF_MODEL,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': build_user_message(facts)}],
    )
    return ''.join(block.text for block in response.content if block.type == 'text')


def _parse(text):
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        raise ValueError('no JSON object in model reply')
    return json.loads(match.group(0))


def _is_valid(data, facts):
    if not isinstance(data, dict):
        return False
    if not isinstance(data.get('summary'), str) or not data['summary'].strip():
        return False
    for key in ('went_well', 'improve', 'next_time'):
        if not isinstance(data.get(key), list) or not all(isinstance(x, str) for x in data[key]):
            return False
    moments = data.get('key_moments')
    if not isinstance(moments, list):
        return False
    stage_names = {e['stage'] for e in facts['events']}
    for m in moments:
        if not isinstance(m, dict):
            return False
        if m.get('stage') not in stage_names:
            return False
        if not all(isinstance(m.get(k), str) for k in ('what_happened', 'ideal', 'why_it_matters')):
            return False
    return True


# --------------------------------------------------------------------------
# Template fallback (same JSON shape, built only from the facts)
# --------------------------------------------------------------------------

WHY_IT_MATTERS = {
    'timing': 'Each farm job works best at the right stage of plant growth. Doing it too early or too late weakens the crop.',
    'nutrient': 'Too little fertiliser leaves the plant hungry, and too much can burn it and wastes money.',
    'unrecognized_fertilizer': 'If the fertiliser is not one the crop needs, the plant may not get the nutrients it needs.',
    'spacing': 'Plants set too close compete for light, water and food. Plants set too far apart waste land.',
    'seeds': 'Too many seeds in one hole crowd each other, and too few leave gaps in the field.',
}

TIPS = {
    'timing': 'Read the timing hint before each job and act inside the window.',
    'nutrient': 'Work out the fertiliser amount carefully before you apply it.',
    'unrecognized_fertilizer': 'Choose a fertiliser from the list so the crop gets the right nutrients.',
    'spacing': 'Check your row and column spacing against the recommended planting area.',
    'seeds': 'Plant the recommended number of seeds in each hole.',
}


def _what_happened(p):
    kind, e, actual, d = p['type'], p.get('expected'), p.get('actual'), p.get('direction')
    if kind == 'timing':
        return f"Done on day {actual}, which was {d}."
    if kind == 'nutrient' and e:
        return f"The fertiliser amount worked out to {actual}, which was too {'low' if d == 'low' else 'high'}."
    if kind == 'nutrient':
        return "The fertiliser used was not recognised."
    if kind == 'spacing':
        return f"The planting area was {actual} cm2, which was {'too close' if d == 'too_close' else 'too wide'}."
    if kind == 'seeds':
        return f"{actual} seeds per hole was {'too few' if d == 'too_few' else 'too many'}."
    return "A mistake was recorded."


def _ideal(p):
    kind, e = p['type'], p.get('expected')
    if kind == 'timing' and e:
        return f"Day {e['earliest_day']} to day {e['latest_day']}."
    if kind == 'nutrient' and e:
        return f"Between {e['min']} and {e['max']}."
    if kind == 'nutrient':
        return "A recognised fertiliser from the list."
    if kind == 'spacing' and e:
        return f"A planting area between {e['min']} and {e['max']} cm2."
    if kind == 'seeds' and e:
        return f"{e['min']} to {e['max']} seeds per hole."
    return "See the syllabus guidance for this stage."


def _why_key(p):
    if p['type'] == 'nutrient' and not p.get('expected'):
        return 'unrecognized_fertilizer'
    return p['type']


def _cost_sentence(p, mode):
    pts = abs(p['points'])
    if mode == 'Free' and p.get('applied'):
        return f" This cost {pts} health points."
    return f" No points were lost in Guided mode. In Free mode this would cost {pts}."


def build_fallback_debrief(facts):
    mode = facts['mode']
    final = facts['final_health']

    # Mistakes, largest first, from the per-event penalties
    mistakes = []
    for ev in facts['events']:
        for p in ev['penalties']:
            mistakes.append((ev['stage'], p))
    mistakes.sort(key=lambda sp: sp[1]['points'])

    key_moments = [{
        'stage': stage,
        'what_happened': _what_happened(p) + _cost_sentence(p, mode),
        'ideal': _ideal(p),
        'why_it_matters': WHY_IT_MATTERS[_why_key(p)],
    } for stage, p in mistakes]

    # Summary
    ran_out = facts['ran_out_of_time_stages']
    if mode == 'Guided':
        if ran_out:
            summary = (f"Time ran out before you finished your {facts['crop']} cycle in Guided mode. "
                       f"{len(ran_out)} stage(s) were not reached. Your health stayed at {final['score']:g}.")
        elif mistakes:
            summary = (f"You finished your {facts['crop']} cycle in Guided mode. Your health stayed at "
                       f"{final['score']:g} because Guided mode only gives feedback, but {len(mistakes)} "
                       f"decision(s) could be better.")
        else:
            summary = (f"You finished your {facts['crop']} cycle in Guided mode and made every decision "
                       f"correctly. Your plot is {final['state']}.")
    else:
        summary = (f"Your {facts['crop']} plot ended {final['state']} with a health score of "
                   f"{final['score']:g}. You lost {facts['points_lost_total']:g} points in total.")

    went_well = [f"{s}: done on time with the right choices." for s in facts['went_well']]

    improve = [f"{stage}: {_what_happened(p)}" for stage, p in mistakes]
    improve += [f"{p['stage']} was not reached before time ran out." for p in ran_out]
    improve += [f"{p['stage']} is an optional stage you skipped, and it cost {abs(p['points'])} points."
                for p in facts['skipped_optional_stages']]

    # Next-time tips: one per kind of mistake, biggest first, max 3
    next_time, seen = [], set()
    for _, p in mistakes:
        k = _why_key(p)
        if k not in seen:
            seen.add(k)
            next_time.append(TIPS[k])
    if ran_out:
        next_time.append('Keep a steady pace so every stage is reached before time runs out.')
    if facts['skipped_optional_stages']:
        next_time.append('Do the optional stages too. They are recommended in the syllabus.')
    if not next_time:
        next_time.append('Try a Free-mode cycle to test yourself without the step-by-step guide.'
                         if mode == 'Guided' else 'Repeat the cycle and aim to keep this record.')

    return {
        'summary': summary,
        'key_moments': key_moments,
        'went_well': went_well,
        'improve': improve,
        'next_time': next_time[:3],
    }


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

def generate_debrief(facts):
    if not facts.get('reconciles', False):
        raise ValueError('Facts do not reconcile with the cycle health score; not generating a debrief.')

    try:
        data = _parse(_call_claude(facts))
        if _is_valid(data, facts):
            data['source'] = 'ai'
            return data
        logger.warning('Debrief JSON failed validation; using template.')
    except Exception:
        logger.exception('Debrief AI call failed; using template.')

    data = build_fallback_debrief(facts)
    data['source'] = 'template'
    return data