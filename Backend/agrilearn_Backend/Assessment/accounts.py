"""
Assessment/accounts.py

Who is making this request, and what are they allowed to see?

  student  an individual account (solo revision, or a student with their own login)
  group    a classroom group signing in with the group's shared credentials
  teacher  runs one or more classes
  admin    the school's principal

A group's login is an ordinary Django user stored on Groups.account. Django hashes
the password, and it is shown to the teacher once, when the group is created or reset.
"""
import secrets
from dataclasses import dataclass
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify

from agrilearn_Backend.Assessment.models import Groups, UserProfile

User = get_user_model()

# Letters and digits that are hard to mix up when a child types them
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def generate_password(length=8):
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _unique_username(base):
    base = slugify(base)[:40] or "group"
    name, n = base, 1
    while User.objects.filter(username__iexact=name).exists():
        n += 1
        name = f"{base}-{n}"
    return name


@transaction.atomic
def create_group_account(group, raw_password=None):
    """Give a group its own login. Returns (username, password): show them once."""
    password = raw_password or generate_password()
    user = User.objects.create_user(
        username=_unique_username(f"{group.school.name}-{group.class_assigned.name}-{group.name}"),
        password=password,
    )
    group.account = user
    group.save(update_fields=["account"])
    return user.username, password


@transaction.atomic
def reset_group_password(group):
    """New password for a group whose credentials were lost. Returns it once."""
    password = generate_password()
    group.account.set_password(password)
    group.account.save(update_fields=["password"])
    return password


@dataclass
class Actor:
    kind: str                       # 'student' | 'group' | 'teacher' | 'admin'
    user: object
    profile: Optional[UserProfile] = None
    group: Optional[Groups] = None
    school_id: Optional[int] = None


def resolve_actor(user):
    """Work out who a signed-in Django user is. Returns None if they are nobody we know."""
    if user is None or not user.is_authenticated:
        return None

    group = Groups.objects.filter(account=user).select_related("school", "class_assigned").first()
    if group:
        return Actor(kind="group", user=user, group=group, school_id=group.school_id)

    profile = UserProfile.objects.filter(user=user).select_related("school").first()
    if profile:
        return Actor(kind=profile.role, user=user, profile=profile, school_id=profile.school_id)

    return None


def get_actor(request):
    """resolve_actor, cached on the request so each request does one lookup."""
    if not hasattr(request, "_actor_cache"):
        request._actor_cache = resolve_actor(request.user)
    return request._actor_cache


def actor_payload(actor):
    """What the frontend is told about the signed-in user."""
    data = {"kind": actor.kind, "username": actor.user.username, "school_id": actor.school_id}
    if actor.profile:
        data["profile_id"] = actor.profile.id
        data["year_of_study"] = actor.profile.year_of_study
    if actor.group:
        data["group"] = {
            "id": actor.group.id,
            "name": actor.group.name,
            "class_id": actor.group.class_assigned_id,
            "class_name": actor.group.class_assigned.name,
        }
    return data


# ---------------------------------------------------------------------------
# Farm cycle ownership
#
# Set these two to the field names on FarmCycle. A cycle belongs to a student
# or to a group, never both.
# ---------------------------------------------------------------------------
CYCLE_STUDENT_FIELD = "student"
CYCLE_GROUP_FIELD = "group"


def cycles_visible_to(actor, queryset):
    """Only the cycles this person may see. Solo cycles never reach a teacher."""
    if actor is None:
        return queryset.none()
    if actor.kind == "student":
        return queryset.filter(**{CYCLE_STUDENT_FIELD: actor.profile})
    if actor.kind == "group":
        return queryset.filter(**{CYCLE_GROUP_FIELD: actor.group})
    if actor.kind == "teacher":
        return queryset.filter(**{f"{CYCLE_GROUP_FIELD}__class_assigned__teacher": actor.profile})
    if actor.kind == "admin":
        return queryset.filter(**{f"{CYCLE_GROUP_FIELD}__school_id": actor.school_id})
    return queryset.none()


def owner_fields_for_new_cycle(actor):
    """The ownership fields to set when this person starts a cycle, or None if they may not."""
    if actor is None:
        return None
    if actor.kind == "student":
        return {"owner_type": "student", CYCLE_STUDENT_FIELD: actor.profile}
    if actor.kind == "group":
        return {"owner_type": "group", CYCLE_GROUP_FIELD: actor.group}
    return None  # teachers and admins watch; they do not farm