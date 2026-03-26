from dcim.models import Device
from django.core.exceptions import ValidationError
from django.db import models
from netbox.models import OrganizationalModel

from .choices import PurdueLevelChoices, SecurityLevelChoices


class SecurityZone(OrganizationalModel):
    """Zona de seguridad IEC 62443."""

    purdue_level = models.PositiveSmallIntegerField(
        choices=PurdueLevelChoices.choices,
        blank=True,
        null=True,
    )
    security_level = models.CharField(
        max_length=8,
        choices=SecurityLevelChoices.choices,
        default=SecurityLevelChoices.SL_1,
    )
    devices = models.ManyToManyField(
        to=Device,
        related_name="ot_security_zones",
        blank=True,
    )

    class Meta:
        ordering = ("name",)
        verbose_name = "security zone"
        verbose_name_plural = "security zones"


class Conduit(OrganizationalModel):
    """Conducto de comunicacion entre dos zonas IEC 62443."""

    source_zone = models.ForeignKey(
        to=SecurityZone,
        related_name="outbound_conduits",
        on_delete=models.PROTECT,
    )
    target_zone = models.ForeignKey(
        to=SecurityZone,
        related_name="inbound_conduits",
        on_delete=models.PROTECT,
    )
    security_level = models.CharField(
        max_length=8,
        choices=SecurityLevelChoices.choices,
        default=SecurityLevelChoices.SL_1,
    )
    allowed_protocols = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "conduit"
        verbose_name_plural = "conduits"
        constraints = [
            models.UniqueConstraint(
                fields=("source_zone", "target_zone"),
                name="netbox_ot_security_unique_zone_pair",
            )
        ]

    def clean(self) -> None:
        """Validar que el conducto no conecte una zona consigo misma."""

        super().clean()
        if (
            self.source_zone_id is not None
            and self.target_zone_id is not None
            and self.source_zone_id == self.target_zone_id
        ):
            raise ValidationError(
                {"target_zone": "Source and target zones must be different"}
            )
