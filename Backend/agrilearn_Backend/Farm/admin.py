from django.contrib import admin

from agrilearn_Backend.Farm.models import CropNutrientRequirement, Crops, CycleEVent, FarmCycle
from agrilearn_Backend.Farm.models import  FertilizerOption, FertlizerNutrientContent, NutrientType, PlantingRequirement, PlantingRequirement, PlotHealthLog, StageDefinition

admin.site.register(Crops)
admin.site.register(StageDefinition) 
admin.site.register(FarmCycle)
admin.site.register(CycleEVent)
admin.site.register(PlotHealthLog)
admin.site.register(NutrientType)
admin.site.register(CropNutrientRequirement)
admin.site.register(FertilizerOption)
admin.site.register(FertlizerNutrientContent)
admin.site.register(PlantingRequirement)