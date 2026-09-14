from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/payments/", include("payments.urls")),
    path("api/pools/", include("pools.urls")),
    path("api/family-pools/", include("family_pools.urls")),
]
