from django.contrib import admin

from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ["tx_hash", "sender", "receiver", "category", "created_at"]
    search_fields = ["tx_hash", "sender", "receiver"]
    list_filter = ["category"]
