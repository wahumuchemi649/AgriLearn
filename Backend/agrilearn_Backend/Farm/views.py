# receive requests, call services, responds
# Create your views here.
from django.shortcuts import render
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .serializers import AvailableActionSerializer, CreateFarmCycleSerializer
from .services import get_available_actions,submit_action, ActionRejected
from rest_framework.generics import get_object_or_404
from .models import FarmCycle
from .serializers import FarmCycleStateSerializer, SubmitActionSerializer
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response
from agrilearn_Backend.Farm.models import CycleDebrief, FarmCycle
from agrilearn_Backend.Farm.services import finalize_if_time_up
from agrilearn_Backend.Farm.debrief_facts import build_debrief_facts
from agrilearn_Backend.Farm.debrief_ai import generate_debrief
from .services import get_available_actions, submit_action, ActionRejected, pause_cycle, resume_cycle

from django.http import Http404
from rest_framework.decorators import authentication_classes, permission_classes
from rest_framework_simplejwt.authentication import JWTAuthentication
from agrilearn_Backend.Assessment.accounts import (
    CYCLE_GROUP_FIELD,
    CYCLE_STUDENT_FIELD,
    cycles_visible_to,
    get_actor,
    owner_fields_for_new_cycle,
)
from agrilearn_Backend.Assessment.permissions import IsKnownUser, IsPlayer


def _cycle_for(request, cycle_id):
    """The cycle, but only if this person may see it. Anyone else gets a 404,
    so cycle ids cannot be probed."""
    cycle = cycles_visible_to(get_actor(request), FarmCycle.objects.filter(id=cycle_id)).first()
    if cycle is None:
        raise Http404
    return cycle


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsPlayer])
def create_cycle(request):
    owner = owner_fields_for_new_cycle(get_actor(request))
    data = {k: v for k, v in request.data.items()}
    data["owner_type"] = owner["owner_type"]
    data[CYCLE_STUDENT_FIELD] = owner[CYCLE_STUDENT_FIELD].id if CYCLE_STUDENT_FIELD in owner else None
    data[CYCLE_GROUP_FIELD] = owner[CYCLE_GROUP_FIELD].id if CYCLE_GROUP_FIELD in owner else None
    serializer = CreateFarmCycleSerializer(data=data)
    if serializer.is_valid():
        cycle = serializer.save(
            Current_virtual_day=0,
            current_segment_start=timezone.now(),
            **owner,
        )
        return Response(CreateFarmCycleSerializer(cycle).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsKnownUser])
def cycle_state(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    serializer = FarmCycleStateSerializer(cycle)
    return Response(serializer.data)


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsKnownUser])
def the_available_actions(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    actions = get_available_actions(cycle)
    serializer = AvailableActionSerializer(actions, many=True)
    return Response(serializer.data)

@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsPlayer])
def submit_cycle_action(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    serializer = SubmitActionSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    fertilizer_name = data.get('fertilizer_name', '').upper() if data.get('fertilizer_name') else None

    try:
        result = submit_action(
            cycle=cycle,
            stage_id=data['stage_id'],
            fertilizer_name=fertilizer_name,
            application_rate=data.get('application_rate'),
            row_spacing_cm=data.get('row_spacing_cm'),
            column_spacing_cm=data.get('column_spacing_cm'),
            seeds_per_hole=data.get('seeds_per_hole'),
        )
    except ActionRejected as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)

    return Response({
        'new_health_score': result['new_health_score'],
        'new_health_state': result['new_health_state'],
    }, status=status.HTTP_200_OK)
from datetime import timedelta


RETRY_TEMPLATE_AFTER = timedelta(minutes=10)
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsKnownUser])
def cycle_debrief(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    finalize_if_time_up(cycle)  # a Guided cycle may have just run out of time

    if cycle.status == 'Active':
        return Response({'detail': 'This cycle is still running. The debrief is available once it ends.'},
                        status=409)

    saved = CycleDebrief.objects.filter(cycle=cycle).first()
    stale_template = (saved and saved.source == 'template'
                      and timezone.now() - saved.created_at > RETRY_TEMPLATE_AFTER)

    if saved is None or stale_template:
        facts = build_debrief_facts(cycle)
        try:
            content = generate_debrief(facts)
        except ValueError as exc:  # facts don't match the health score
            if saved is None:
                return Response({'detail': str(exc)}, status=422)
            content = None
        if content is not None:
            saved, _ = CycleDebrief.objects.update_or_create(
                cycle=cycle,
                defaults={'content': content, 'facts': facts, 'source': content['source']},
            )

    return Response({
        'cycle_id': cycle.id,
        'mode': cycle.mode,
        'status': cycle.status,
        'final_health': {'score': float(cycle.current_health_score),
                         'state': cycle.current_health_state},
        'debrief': saved.content,
        'source': saved.source,
    })
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsPlayer])
def pause_cycle_view(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    try:
        cycle = pause_cycle(cycle)
    except ActionRejected as e:
        return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)
    return Response(FarmCycleStateSerializer(cycle).data)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsPlayer])
def resume_cycle_view(request, cycle_id):
    cycle = _cycle_for(request, cycle_id)
    try:
        cycle = resume_cycle(cycle)
    except ActionRejected as e:
        return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)
    return Response(FarmCycleStateSerializer(cycle).data)