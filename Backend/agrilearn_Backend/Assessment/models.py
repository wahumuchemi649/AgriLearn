
from django.db import models

# Create your models here.
class School(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField()

    def __str__(self):
        return self.name



class UserProfile(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=20, choices=[('admin','Admin'),('teacher','Teacher'),('student','Student')])
    school = models.ForeignKey('School', on_delete=models.CASCADE, null=True, blank=True)
    year_of_study = models.IntegerField(null=True, blank=True)
    parent_contact = models.CharField(max_length=15, null=True, blank=True)

    def __str__(self):
      return self.user.username

class Classes(models.Model):
    name= models.CharField(max_length=100)
    school= models.ForeignKey(School, on_delete=models.CASCADE)
    teacher=models.ForeignKey(UserProfile,on_delete=models.CASCADE, limit_choices_to={'role': 'teacher'})

class Groups(models.Model):# A password that members can use to join the group
    name= models.CharField(max_length=100)
    school= models.ForeignKey(School, on_delete=models.CASCADE)
    class_assigned=models.ForeignKey(Classes, on_delete=models.CASCADE)
    members=models.ManyToManyField(UserProfile, limit_choices_to={'role': 'student'})
    password=models.CharField(max_length=100, null=True)

class Scores(models.Model):
    cycle=models.ForeignKey('Farm.FarmCycle', on_delete=models.CASCADE)
    competency_Levels=models.CharField(max_length= 100, choices=[('EE','EE'),('ME','ME'),('AE','AE'),('BE','BE')])
    notes=models.TextField(null=True)


