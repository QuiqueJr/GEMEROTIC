"""
FilterSets del plugin OT de GEMEROTIC.
"""

from django.db.models import Q
from netbox.filtersets import OrganizationalModelFilterSet
from utilities.filtersets import register_filterset

from .models import Conduit, SecurityZone


@register_filterset
class SecurityZoneFilterSet(OrganizationalModelFilterSet):
    class Meta:
        model = SecurityZone
        fields = ("id", "name", "slug", "purdue_level", "security_level")

    def search(self, queryset, name, value):
        if not value.strip():
            return queryset

        return queryset.filter(
            Q(name__icontains=value)
            | Q(slug__icontains=value)
            | Q(description__icontains=value)
        )


@register_filterset
class ConduitFilterSet(OrganizationalModelFilterSet):
    class Meta:
        model = Conduit
        fields = (
            "id",
            "name",
            "slug",
            "security_level",
            "source_zone",
            "target_zone",
        )

    def search(self, queryset, name, value):
        if not value.strip():
            return queryset

        return queryset.filter(
            Q(name__icontains=value)
            | Q(slug__icontains=value)
            | Q(description__icontains=value)
        )
