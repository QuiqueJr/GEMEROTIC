from netbox.api.viewsets import NetBoxModelViewSet

from netbox_ot_security.filtersets import ConduitFilterSet, SecurityZoneFilterSet
from netbox_ot_security.models import Conduit, SecurityZone

from .serializers import ConduitSerializer, SecurityZoneSerializer


class SecurityZoneViewSet(NetBoxModelViewSet):
    queryset = SecurityZone.objects.prefetch_related("devices", "tags")
    serializer_class = SecurityZoneSerializer
    filterset_class = SecurityZoneFilterSet


class ConduitViewSet(NetBoxModelViewSet):
    queryset = Conduit.objects.select_related("source_zone", "target_zone")
    serializer_class = ConduitSerializer
    filterset_class = ConduitFilterSet
