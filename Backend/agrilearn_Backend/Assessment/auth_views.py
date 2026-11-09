"""
Assessment/auth_views.py

POST /auth/login/                     username + password -> tokens + who you are
POST /auth/refresh/                   (SimpleJWT's own view, see urls.py)
POST /auth/register/                  solo student sign-up (no school, no teacher)
GET  /auth/me/                        who am I
GET  /groups/                         teacher or admin: the groups in their classes
POST /groups/                         teacher or admin: create a group and its login
POST /groups/<id>/reset-password/     teacher or admin: new password for a group
"""
import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed, Throttled
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from agrilearn_Backend.Assessment.accounts import (
    actor_payload,
    create_group_account,
    get_actor,
    reset_group_password,
    resolve_actor,
)
from agrilearn_Backend.Assessment.models import Classes, Groups, UserProfile
from agrilearn_Backend.Assessment.permissions import IsKnownUser, IsTeacherOrAdmin

User = get_user_model()

# A group's password is shared by a whole class, so guess-proof it by username.
# (Locking by IP would lock out a whole school behind one connection.)
MAX_FAILS = 8
LOCK_SECONDS = 600


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
class ActorTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        actor = resolve_actor(user)
        if actor:
            # Handy for the frontend. Access rules always re-check the database,
            # never these claims.
            token["kind"] = actor.kind
            token["school_id"] = actor.school_id
            if actor.profile:
                token["profile_id"] = actor.profile.id
            if actor.group:
                token["group_id"] = actor.group.id
        return token

    def validate(self, attrs):
        username = str(attrs.get(self.username_field, "")).strip().lower()
        key = f"login-fail:{username}"
        if cache.get(key, 0) >= MAX_FAILS:
            raise Throttled(wait=LOCK_SECONDS)

        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            cache.add(key, 0, LOCK_SECONDS)
            try:
                cache.incr(key)
            except ValueError:
                cache.set(key, 1, LOCK_SECONDS)
            raise

        actor = resolve_actor(self.user)
        if actor is None:
            raise AuthenticationFailed("This account is not set up for AgriLearn. Ask your teacher.")

        cache.delete(key)
        data["actor"] = actor_payload(actor)
        return data


class LoginView(TokenObtainPairView):
    serializer_class = ActorTokenSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


# ---------------------------------------------------------------------------
# Solo student sign-up
# ---------------------------------------------------------------------------
PHONE_RE = re.compile(r"^\+?\d{9,14}$")


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    parent_contact = serializers.CharField(max_length=15)
    year_of_study = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=12)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is taken.")
        return value

    def validate_parent_contact(self, value):
        value = value.replace(" ", "")
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a phone number, for example 0712345678.")
        return value

    def validate(self, attrs):
        try:
            validate_password(attrs["password"], user=User(username=attrs["username"]))
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        with transaction.atomic():
            user = User.objects.create_user(username=d["username"], password=d["password"])
            UserProfile.objects.create(
                user=user,
                role="student",
                parent_contact=d["parent_contact"],
                year_of_study=d.get("year_of_study"),
            )
        refresh = ActorTokenSerializer.get_token(user)
        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "actor": actor_payload(resolve_actor(user)),
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    permission_classes = [IsKnownUser]

    def get(self, request):
        return Response(actor_payload(get_actor(request)))


# ---------------------------------------------------------------------------
# Groups (teacher or admin)
# ---------------------------------------------------------------------------
def _classes_for(actor):
    """The classes this teacher runs, or every class in the principal's school."""
    if actor.kind == "teacher":
        return Classes.objects.filter(teacher=actor.profile)
    return Classes.objects.filter(school_id=actor.school_id)


class GroupCreateSerializer(serializers.Serializer):
    class_id = serializers.IntegerField()
    name = serializers.CharField(max_length=100)
    member_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)


def _group_payload(group):
    return {
        "id": group.id,
        "name": group.name,
        "class_id": group.class_assigned_id,
        "class_name": group.class_assigned.name,
        "username": group.account.username if group.account else None,
        "member_ids": [m.id for m in group.members.all()],
    }


class GroupListCreateView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request):
        actor = get_actor(request)
        groups = (
            Groups.objects.filter(class_assigned__in=_classes_for(actor))
            .select_related("class_assigned", "account")
            .prefetch_related("members")
            .order_by("class_assigned_id", "name")
        )
        return Response([_group_payload(g) for g in groups])

    def post(self, request):
        actor = get_actor(request)
        ser = GroupCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        cls = _classes_for(actor).filter(id=d["class_id"]).select_related("school").first()
        if cls is None:
            return Response({"detail": "Class not found."}, status=status.HTTP_404_NOT_FOUND)

        name = d["name"].strip()
        if Groups.objects.filter(class_assigned=cls, name__iexact=name).exists():
            return Response({"detail": "This class already has a group with that name."},
                            status=status.HTTP_400_BAD_REQUEST)

        ids = set(d["member_ids"])
        members = list(UserProfile.objects.filter(id__in=ids, role="student", school_id=cls.school_id))
        if len(members) != len(ids):
            return Response({"detail": "Some students were not found in this school."},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            group = Groups.objects.create(name=name, school=cls.school, class_assigned=cls)
            group.members.set(members)
            username, password = create_group_account(group)

        payload = _group_payload(group)
        payload.update({"username": username, "password": password})  # shown once
        return Response(payload, status=status.HTTP_201_CREATED)


class GroupResetPasswordView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def post(self, request, pk):
        actor = get_actor(request)
        group = (
            Groups.objects.filter(pk=pk, class_assigned__in=_classes_for(actor))
            .select_related("account", "school", "class_assigned")
            .first()
        )
        if group is None:
            return Response({"detail": "Group not found."}, status=status.HTTP_404_NOT_FOUND)

        if group.account is None:
            username, password = create_group_account(group)
        else:
            username, password = group.account.username, reset_group_password(group)
        return Response({"username": username, "password": password})  # shown once