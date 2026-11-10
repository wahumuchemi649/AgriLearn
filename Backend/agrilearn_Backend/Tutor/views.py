from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from agrilearn_Backend.Assessment.accounts import (
    cycles_visible_to, get_actor, owner_fields_for_new_cycle,
)
from agrilearn_Backend.Assessment.permissions import IsPlayer
from agrilearn_Backend.Farm.models import FarmCycle

from . import services
from .models import TutorConversation


def _cycle_for(request, cycle_id):
    # Same rule as the farm: you only reach cycles you own (404 otherwise, never 403)
    qs = cycles_visible_to(get_actor(request), FarmCycle.objects.all())
    return get_object_or_404(qs, id=cycle_id)


class TutorBase(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsPlayer]  # students and groups. Teachers don't ask the tutor.


class AskView(TutorBase):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "tutor"

    def post(self, request):
        question = str(request.data.get("question", "")).strip()
        if not question:
            return Response({"detail": "Type a question first."}, status=400)
        if len(question) > services.MAX_QUESTION_CHARS:
            return Response(
                {"detail": f"Keep your question under {services.MAX_QUESTION_CHARS} characters."},
                status=400,
            )

        # cycle_id is optional: without it this is a general chat about the syllabus
        raw_cycle_id = request.data.get("cycle_id")
        cycle = None
        if raw_cycle_id not in (None, ""):
            try:
                cycle_id = int(raw_cycle_id)
            except (TypeError, ValueError):
                return Response({"detail": "cycle_id must be a number."}, status=400)
            cycle = _cycle_for(request, cycle_id)  # 404 if it isn't theirs

        owner = owner_fields_for_new_cycle(get_actor(request))
        result = services.answer(cycle, question, owner)

        # Only real answers are saved. "Can't reach the tutor" messages would pollute the history.
        if result["source"] == "ai" or result.get("fallback_reason") == "no_relevant_notes":
            row = TutorConversation.objects.create(
                user=owner.get("student"), group=owner.get("group"),
                cycle=cycle, question=question, answer=result["answer"],
            )
            result["id"] = row.id
        return Response(result)


class HistoryView(TutorBase):
    def get(self, request, cycle_id=None):
        cycle = _cycle_for(request, cycle_id) if cycle_id is not None else None
        owner = owner_fields_for_new_cycle(get_actor(request))
        rows = services.conversation_rows(cycle, owner).order_by("timestamp")[:100]
        return Response([
            {"id": r.id, "question": r.question, "answer": r.answer, "timestamp": r.timestamp}
            for r in rows
        ])