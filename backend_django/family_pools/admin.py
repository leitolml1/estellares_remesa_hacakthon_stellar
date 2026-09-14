from django.contrib import admin

from .models import FamilyPool, FamilyPoolDeposit


@admin.register(FamilyPool)
class FamilyPoolAdmin(admin.ModelAdmin):
    list_display = ["pool_account", "title", "med_threshold", "high_threshold", "withdrawal_limit", "created_at"]
    search_fields = ["pool_account", "creator"]


@admin.register(FamilyPoolDeposit)
class FamilyPoolDepositAdmin(admin.ModelAdmin):
    list_display = ["tx_hash", "pool", "depositor", "created_at"]
    search_fields = ["tx_hash", "depositor"]
