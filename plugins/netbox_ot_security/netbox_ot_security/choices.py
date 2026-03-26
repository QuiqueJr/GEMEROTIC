"""
Opciones reutilizables para el plugin OT de GEMEROTIC.
"""

from django.db import models


class PurdueLevelChoices(models.IntegerChoices):
    LEVEL_0 = 0, "Level 0"
    LEVEL_1 = 1, "Level 1"
    LEVEL_2 = 2, "Level 2"
    LEVEL_3 = 3, "Level 3"
    LEVEL_4 = 4, "Level 4"
    LEVEL_5 = 5, "Level 5"


class SecurityLevelChoices(models.TextChoices):
    SL_0 = "SL-0", "SL-0"
    SL_1 = "SL-1", "SL-1"
    SL_2 = "SL-2", "SL-2"
    SL_3 = "SL-3", "SL-3"
    SL_4 = "SL-4", "SL-4"
