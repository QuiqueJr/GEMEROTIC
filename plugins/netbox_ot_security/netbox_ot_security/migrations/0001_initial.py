# Generated manually for GEMEROTIC.

import django.db.models.deletion
import taggit.managers
import utilities.json
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("dcim", "0226_modulebay_rebuild_tree"),
        ("extras", "0134_owner"),
        ("users", "0015_owner"),
    ]

    operations = [
        migrations.CreateModel(
            name="SecurityZone",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created", models.DateTimeField(auto_now_add=True, null=True)),
                ("last_updated", models.DateTimeField(auto_now=True, null=True)),
                (
                    "custom_field_data",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        encoder=utilities.json.CustomFieldJSONEncoder,
                    ),
                ),
                ("name", models.CharField(max_length=100, unique=True)),
                ("slug", models.SlugField(max_length=100, unique=True)),
                ("description", models.CharField(blank=True, max_length=200)),
                ("comments", models.TextField(blank=True)),
                (
                    "purdue_level",
                    models.IntegerField(
                        blank=True,
                        choices=[
                            (0, "Level 0"),
                            (1, "Level 1"),
                            (2, "Level 2"),
                            (3, "Level 3"),
                            (4, "Level 4"),
                            (5, "Level 5"),
                        ],
                        null=True,
                    ),
                ),
                (
                    "security_level",
                    models.CharField(
                        choices=[
                            ("SL-0", "SL-0"),
                            ("SL-1", "SL-1"),
                            ("SL-2", "SL-2"),
                            ("SL-3", "SL-3"),
                            ("SL-4", "SL-4"),
                        ],
                        default="SL-1",
                        max_length=4,
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        to="users.owner",
                    ),
                ),
                (
                    "tags",
                    taggit.managers.TaggableManager(
                        blank=True,
                        through="extras.TaggedItem",
                        to="extras.Tag",
                    ),
                ),
            ],
            options={
                "ordering": ("name",),
                "verbose_name": "security zone",
                "verbose_name_plural": "security zones",
            },
        ),
        migrations.CreateModel(
            name="Conduit",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created", models.DateTimeField(auto_now_add=True, null=True)),
                ("last_updated", models.DateTimeField(auto_now=True, null=True)),
                (
                    "custom_field_data",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        encoder=utilities.json.CustomFieldJSONEncoder,
                    ),
                ),
                ("name", models.CharField(max_length=100, unique=True)),
                ("slug", models.SlugField(max_length=100, unique=True)),
                ("description", models.CharField(blank=True, max_length=200)),
                ("comments", models.TextField(blank=True)),
                (
                    "security_level",
                    models.CharField(
                        choices=[
                            ("SL-0", "SL-0"),
                            ("SL-1", "SL-1"),
                            ("SL-2", "SL-2"),
                            ("SL-3", "SL-3"),
                            ("SL-4", "SL-4"),
                        ],
                        default="SL-1",
                        max_length=4,
                    ),
                ),
                (
                    "allowed_protocols",
                    models.JSONField(blank=True, default=list),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        to="users.owner",
                    ),
                ),
                (
                    "source_zone",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="outbound_conduits",
                        to="netbox_ot_security.securityzone",
                    ),
                ),
                (
                    "target_zone",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="inbound_conduits",
                        to="netbox_ot_security.securityzone",
                    ),
                ),
                (
                    "tags",
                    taggit.managers.TaggableManager(
                        blank=True,
                        through="extras.TaggedItem",
                        to="extras.Tag",
                    ),
                ),
            ],
            options={
                "ordering": ("name",),
                "verbose_name": "conduit",
                "verbose_name_plural": "conduits",
            },
        ),
        migrations.AddField(
            model_name="securityzone",
            name="devices",
            field=models.ManyToManyField(
                blank=True,
                related_name="ot_security_zones",
                to="dcim.device",
            ),
        ),
    ]
