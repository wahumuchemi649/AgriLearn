from django.contrib import admin

from agrilearn_Backend.Assessment.models import Classes, Groups, School, UserProfile,Scores

# Register your models here.
admin.site.register(School)
admin.site.register(UserProfile)
admin.site.register(Classes)
admin.site.register(Groups)
admin.site.register(Scores)