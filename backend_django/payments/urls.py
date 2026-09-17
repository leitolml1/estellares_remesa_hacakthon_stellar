from django.urls import path

from .views import (
    PaymentHistoryView,
    PaymentMetadataView,
    QuoteView,
    RecurringDetailView,
    RecurringListCreateView,
)

urlpatterns = [
    path("", PaymentMetadataView.as_view(), name="payment-metadata-create"),
    path("history/<str:public_key>/", PaymentHistoryView.as_view(), name="payment-history"),
    path("quote/", QuoteView.as_view(), name="payment-quote"),
    path("recurring/", RecurringListCreateView.as_view(), name="recurring-list-create"),
    path("recurring/<int:rule_id>/", RecurringDetailView.as_view(), name="recurring-detail"),
]
