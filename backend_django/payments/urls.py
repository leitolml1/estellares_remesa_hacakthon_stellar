from django.urls import path

from .views import PaymentHistoryView, PaymentMetadataView

urlpatterns = [
    path("", PaymentMetadataView.as_view(), name="payment-metadata-create"),
    path("history/<str:public_key>/", PaymentHistoryView.as_view(), name="payment-history"),
]
