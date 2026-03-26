from dcim.models import Device
from netbox.api.serializers import NetBoxModelSerializer
from rest_framework import serializers

from netbox_ot_security.models import Conduit, SecurityZone


class SecurityZoneSerializer(NetBoxModelSerializer):
    devices = serializers.PrimaryKeyRelatedField(
        queryset=Device.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = SecurityZone
        fields = (
            "id",
            "url",
            "display",
            "name",
            "slug",
            "description",
            "comments",
            "purdue_level",
            "security_level",
            "devices",
            "tags",
            "custom_fields",
            "created",
            "last_updated",
        )
        brief_fields = (
            "id",
            "url",
            "display",
            "name",
            "slug",
            "description",
        )


class ConduitSerializer(NetBoxModelSerializer):
    source_zone = serializers.PrimaryKeyRelatedField(
        queryset=SecurityZone.objects.all(),
    )
    target_zone = serializers.PrimaryKeyRelatedField(
        queryset=SecurityZone.objects.all(),
    )

    class Meta:
        model = Conduit
        fields = (
            "id",
            "url",
            "display",
            "name",
            "slug",
            "description",
            "comments",
            "source_zone",
            "target_zone",
            "security_level",
            "allowed_protocols",
            "tags",
            "custom_fields",
            "created",
            "last_updated",
        )
        brief_fields = (
            "id",
            "url",
            "display",
            "name",
            "slug",
            "description",
        )
