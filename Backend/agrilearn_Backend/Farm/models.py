from django.db import models

class Crops(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(null=True, blank=True)
    real_world_duration_days=models.IntegerField(null=False, default=150) #e.g maize take 150 days- 5 months, Record in days
    def __str__(self):
        return f"{self.name}"


class StageDefinition(models.Model):
    crop = models.ForeignKey(Crops, on_delete=models.CASCADE)
    order = models.IntegerField()
    stage_name = models.CharField(max_length=100)
    earliest_virtual_date = models.IntegerField()# earliest the stage can be perfomed
    latest_virtual_date=models.IntegerField()# latest the stage can be perfomed
    is_optional = models.BooleanField(default=False)
    timing_hint = models.CharField(max_length=200, blank=True, default="")
    action_type=models.CharField(max_length=50,default="OTHER",choices=[
         ("LAND_PREP","LAND_PREP" ),
         ("SEED_SELECTION","SEED_SELECTION"),
         ("SPACING_DECISION","SPACING_DECISION"),
         ("PLANTING","PLANTING"), 
         ("FERTILIZER_APPLICATION","FERTILIZER_APPLICATION"),
          ("WEEDING","WEEDING"),
          ("PEST_CONTROL","PEST_CONTROL"),
           ("HARVEST","HARVEST"),
            ("OTHER","OTHER"),
    ])

class FarmCycle(models.Model): # what should be done in the cycle, and what is the current state of the cycle
     owner_type = models.CharField(max_length=100)
     student = models.ForeignKey('Assessment.UserProfile', on_delete=models.CASCADE, null=True)
     group = models.ForeignKey('Assessment.Groups', on_delete=models.CASCADE, null=True)
     crop = models.ForeignKey(Crops, on_delete=models.CASCADE)
     mode= models.CharField(max_length=100, choices=[('Guided', 'Guided'), ('Free', 'Free')])
     real_duration_hours = models.DecimalField(max_digits=6, decimal_places=2, default=24.00) # total time in days, of how long you want the cycle to run
    # pause/resume tracking — replaces any fixed active-hours-window idea
     is_paused = models.BooleanField(default=False)
     accumulated_active_seconds = models.BigIntegerField(default=0)
     current_segment_start = models.DateTimeField(null=True, blank=True)
     Current_virtual_day=models.IntegerField() # the current virtual date of the cycle, this will be used to determine which stage is active
     status=models.CharField(max_length=100, choices=[('Active', 'Active'), ('Completed', 'Completed'), ('Failed', 'Failed')], default='Active')
     current_health_score=models.DecimalField(max_digits=10, decimal_places=2, default=100.00) # the current health score of the cycle, this will be used to determine if the cycle is failed or not
     current_health_state=models.CharField(max_length=100, choices=[('Thriving', 'Thriving'), ('Healthy', 'Healthy'), ('Stressed','Stressed'),('Stunted', 'Stunted'),('Dead','Dead')], default='Healthy') # The state here will be determined by the current health score, and will be used to determine if the cycle is failed or not


class PlotHealthLog(models.Model):
     cycle=models.ForeignKey(FarmCycle, on_delete=models.CASCADE)
     virtual_day=models.IntegerField() # the virtual day when the health score was recorded
     health_score=models.DecimalField(max_digits=10, decimal_places=2) # the health score of the plot on that virtual day
     health_state=models.CharField(max_length=100, choices=[('Thriving', 'Thriving'), ('Healthy', 'Healthy'), ('Stressed','Stressed'),('Stunted', 'Stunted'),('Dead','Dead')]) # The state here will be determined by the health score, and will be used to determine if the cycle is failed or not
     stress_flags=models.JSONField() # a json field to store the stress flags for the plot on that virtual day
     penalties = models.JSONField(default=list)

class NutrientType(models.Model):
     name=models.CharField(max_length=100)
     unit=models.CharField(max_length=100)

class CropNutrientRequirement(models.Model):
     crop_name=models.ForeignKey(Crops, on_delete=models.CASCADE)
     stage=models.ForeignKey(StageDefinition, on_delete=models.CASCADE)
     nutrient_type=models.ForeignKey(NutrientType,on_delete=models.CASCADE, null=True)
     ideal_min=models.DecimalField(max_digits=5,decimal_places=2)
     ideal_max=models.DecimalField(max_digits=5,decimal_places=2)

class FertilizerOption(models.Model):
     name=models.CharField(max_length=100)
     applicable_crops = models.ManyToManyField(Crops, blank=True)

class CycleEVent(models.Model): # This is to determine what was actually done
     cycle=models.ForeignKey(FarmCycle, on_delete=models.CASCADE)
     stage=models.ForeignKey(StageDefinition, on_delete=models.CASCADE)
     virtual_date=models.IntegerField() # the virtual date when the event was performed
     performed_by=models.ForeignKey('Assessment.UserProfile', on_delete=models.CASCADE, null=True) # the user who performed the event
     was_on_time=models.BooleanField() # whether the event was performed on time or not
     real_time=models.DateTimeField(auto_now_add=True) # the real time when the event was performed
     fertilizer_used = models.ForeignKey(FertilizerOption, on_delete=models.SET_NULL, null=True, blank=True)
     application_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
     decision_details=models.JSONField(null=True)

class FertlizerNutrientContent(models.Model):
       fertilizer=models.ForeignKey(FertilizerOption, on_delete=models.CASCADE)
       nutrient_type=models.ForeignKey(NutrientType, on_delete=models.CASCADE)
       content_percent=models.DecimalField(max_digits=100,decimal_places=2)
       uptake_efficiency_modifier=models.DecimalField(max_digits=100,decimal_places=2)

class PlantingRequirement(models.Model):
     crop=models.ForeignKey(Crops, on_delete=models.CASCADE)
     stage=models.ForeignKey(StageDefinition, on_delete=models.CASCADE)
     ideal_area_min_cm2=models.DecimalField(max_digits=8,decimal_places=2, null=True)
     ideal_area_max_cm2=models.DecimalField(max_digits=8,decimal_places=2, null=True)
     min_seeds_per_hole=models.IntegerField()
     max_seeds_per_hole=models.IntegerField()
     
     
class CycleDebrief(models.Model):
    cycle = models.OneToOneField(FarmCycle, on_delete=models.CASCADE, related_name='debrief')
    content = models.JSONField()   # summary, key_moments, went_well, improve, next_time
    facts = models.JSONField()     # snapshot of what the AI was given, for auditing
    source = models.CharField(max_length=20, choices=[('ai', 'ai'), ('template', 'template')])
    created_at = models.DateTimeField(auto_now_add=True)