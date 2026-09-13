from django.contrib import admin

from .models import Pool


@admin.register(Pool)
class PoolAdmin(admin.ModelAdmin):
    list_display = ["short_code", "title", "wallet_address", "donation_count", "goal_amount", "created_at"]
    search_fields = ["short_code", "wallet_address", "creator"]
