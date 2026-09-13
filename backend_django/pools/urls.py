from django.urls import path

from .views import PoolCreateView, PoolDetailView

urlpatterns = [
    path("", PoolCreateView.as_view(), name="pool-create"),
    path("<str:short_code>/", PoolDetailView.as_view(), name="pool-detail"),
]
