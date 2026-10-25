from django.urls import path
from . import views

urlpatterns = [
    path('cycles/', views.create_cycle, name='create-cycle'),
    path('cycles/<int:cycle_id>/', views.cycle_state, name='cycle-state'),
    path('cycles/<int:cycle_id>/available-actions/', views.the_available_actions, name='available-actions'),
    path('cycles/<int:cycle_id>/actions/', views.submit_cycle_action, name='submit-action'),
    path('cycles/<int:cycle_id>/debrief/', views.cycle_debrief),
    path('cycles/<int:cycle_id>/pause/', views.pause_cycle_view, name='pause-cycle'),
    path('cycles/<int:cycle_id>/resume/', views.resume_cycle_view, name='resume-cycle'),
]