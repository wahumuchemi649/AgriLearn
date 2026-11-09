from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from agrilearn_Backend.Assessment import auth_views as v

urlpatterns = [
    path("auth/login/", v.LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/register/", v.RegisterView.as_view()),
    path("auth/me/", v.MeView.as_view()),
    path("groups/", v.GroupListCreateView.as_view()),
    path("groups/<int:pk>/reset-password/", v.GroupResetPasswordView.as_view()),
]