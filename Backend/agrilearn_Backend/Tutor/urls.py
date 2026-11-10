from django.urls import path

from . import views

urlpatterns = [
    path("ask/", views.AskView.as_view()),
    path("history/", views.HistoryView.as_view()),  # general chat, no cycle
    path("history/<int:cycle_id>/", views.HistoryView.as_view()),
]