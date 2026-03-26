from netbox.api.routers import NetBoxRouter

from .views import ConduitViewSet, SecurityZoneViewSet

router = NetBoxRouter()
router.register("security-zones", SecurityZoneViewSet)
router.register("conduits", ConduitViewSet)

urlpatterns = router.urls
