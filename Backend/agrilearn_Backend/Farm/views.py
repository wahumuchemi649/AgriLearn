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



@api_view(['POST'])
def create_cycle(request):
    serializer = CreateFarmCycleSerializer(data=request.data)
    if serializer.is_valid():
        cycle = serializer.save(
            Current_virtual_day=0,
            current_segment_start=timezone.now(),
        )
        return Response(CreateFarmCycleSerializer(cycle).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def cycle_state(request, cycle_id):
    cycle = get_object_or_404(FarmCycle, id=cycle_id)
    serializer = FarmCycleStateSerializer(cycle)
    return Response(serializer.data)


@api_view(['GET'])
def the_available_actions(request, cycle_id):
    cycle = get_object_or_404(FarmCycle, id=cycle_id)
    actions = get_available_actions(cycle)
    serializer = AvailableActionSerializer(actions, many=True)
    return Response(serializer.data)

@api_view(['POST'])
def submit_cycle_action(request, cycle_id):
    cycle = get_object_or_404(FarmCycle, id=cycle_id)
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