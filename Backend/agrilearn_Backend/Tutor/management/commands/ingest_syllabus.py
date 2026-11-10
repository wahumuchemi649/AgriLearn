import json

from django.core.management.base import BaseCommand, CommandError

from agrilearn_Backend.Farm.models import Crops, StageDefinition
from agrilearn_Backend.Tutor.Llm import embed
from agrilearn_Backend.Tutor.models import SyllabusChunk


class Command(BaseCommand):
    help = "Load syllabus notes from a JSON file and embed them. Safe to run again: matching notes are updated."

    def add_arguments(self, parser):
        parser.add_argument("path")

    def handle(self, *args, **opts):
        with open(opts["path"], encoding="utf-8") as f:
            items = json.load(f)

        rows, problems = [], []
        for i, it in enumerate(items, 1):
            try:
                crop = Crops.objects.get(name__iexact=it["crop"])
                stage = StageDefinition.objects.get(crop=crop, order=it["stage_order"])
                rows.append((crop, stage, it["topic"].strip(), it["content"].strip()))
            except (KeyError, Crops.DoesNotExist, StageDefinition.DoesNotExist) as e:
                problems.append(f"item {i}: {type(e).__name__} {e}")
        if problems:
            raise CommandError("Fix these first, nothing was saved:\n" + "\n".join(problems))

        vectors = embed([f"{t}. {c}" for _, _, t, c in rows])
        for (crop, stage, topic, content), vec in zip(rows, vectors):
            SyllabusChunk.objects.update_or_create(
                crop=crop, stage=stage, topic=topic,
                defaults={"content": content, "embedding": vec},
            )
        self.stdout.write(self.style.SUCCESS(f"Saved {len(rows)} notes."))