from django.db import models
from pgvector.django import VectorField
from agrilearn_Backend.Assessment.models import UserProfile
from agrilearn_Backend.Farm.models import Crops, FarmCycle,StageDefinition

# Create your models here.
class SyllabusChunk(models.Model):
    topic=models.CharField(max_length=100)
    content=models.TextField()
    embedding = VectorField(dimensions=768)
    crop= models.ForeignKey(Crops, on_delete=models.CASCADE)
    stage=models.ForeignKey(StageDefinition, on_delete=models.CASCADE)
    
class TutorConversation(models.Model):
    user=models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    cycle=models.ForeignKey(FarmCycle, on_delete=models.CASCADE)
    question=models.TextField()
    answer=models.TextField()
    timestamp=models.DateTimeField(auto_now_add=True)