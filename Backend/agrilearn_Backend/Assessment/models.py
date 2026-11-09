from django.contrib.auth import get_user_model
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


# Create your models here.
class School(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField()

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    # user is empty for a roster student who has no account yet (class lists)
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=20, choices=[('admin', 'Admin'), ('teacher', 'Teacher'), ('student', 'Student')])
    school = models.ForeignKey('School', on_delete=models.CASCADE, null=True, blank=True)
    year_of_study = models.IntegerField(null=True, blank=True)
    parent_contact = models.CharField(max_length=15, null=True, blank=True)

    def __str__(self):
        return self.user.username if self.user else f"Profile {self.pk} ({self.role})"


class Classes(models.Model):
    name = models.CharField(max_length=100)
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    teacher = models.ForeignKey(UserProfile, on_delete=models.CASCADE, limit_choices_to={'role': 'teacher'})


class Groups(models.Model):
    name = models.CharField(max_length=100)
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    class_assigned = models.ForeignKey(Classes, on_delete=models.CASCADE)
    members = models.ManyToManyField(UserProfile, limit_choices_to={'role': 'student'}, blank=True)

    # The group signs in as this Django user. Django stores the password hashed,
    # so the old plain-text `password` field is gone.
    account = models.OneToOneField(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='group_account'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['class_assigned', 'name'], name='unique_group_name_per_class'),
        ]

    def __str__(self):
        return f"{self.name} ({self.class_assigned.name})"


@receiver(post_delete, sender=Groups)
def delete_group_account(sender, instance, **kwargs):
    """Deleting a group also removes its login."""
    if instance.account_id:
        get_user_model().objects.filter(pk=instance.account_id).delete()


class Scores(models.Model):
    cycle = models.ForeignKey('Farm.FarmCycle', on_delete=models.CASCADE)
    competency_Levels = models.CharField(max_length=100, choices=[('EE', 'EE'), ('ME', 'ME'), ('AE', 'AE'), ('BE', 'BE')])
    notes = models.TextField(null=True)