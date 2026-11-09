"""
Assessment/permissions.py

Use on a view:  permission_classes = [IsPlayer]
"""
from rest_framework.permissions import BasePermission

from agrilearn_Backend.Assessment.accounts import get_actor


class _Kinds(BasePermission):
    kinds = ()

    def has_permission(self, request, view):
        actor = get_actor(request)
        return bool(actor and actor.kind in self.kinds)


class IsPlayer(_Kinds):
    """Students and groups: the people who run farm cycles."""
    kinds = ("student", "group")


class IsTeacherOrAdmin(_Kinds):
    kinds = ("teacher", "admin")


class IsKnownUser(_Kinds):
    kinds = ("student", "group", "teacher", "admin")