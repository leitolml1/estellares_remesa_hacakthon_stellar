from django.urls import path

from .views import (
    PoolCreateView,
    PoolDetailView,
    PoolDonationsView,
    VaultDepositBuildView,
    VaultLeaderboardView,
    VaultRegisterBuildView,
    VaultStateView,
    VaultSubmitView,
    VaultWithdrawBuildView,
)

urlpatterns = [
    path("", PoolCreateView.as_view(), name="pool-create"),
    path("<str:short_code>/", PoolDetailView.as_view(), name="pool-detail"),
    path(
        "<str:short_code>/donations/",
        PoolDonationsView.as_view(),
        name="pool-donations",
    ),
    path(
        "<str:short_code>/vault/register-build/",
        VaultRegisterBuildView.as_view(),
        name="pool-vault-register-build",
    ),
    path(
        "<str:short_code>/vault/deposit-build/",
        VaultDepositBuildView.as_view(),
        name="pool-vault-deposit-build",
    ),
    path(
        "<str:short_code>/vault/withdraw-build/",
        VaultWithdrawBuildView.as_view(),
        name="pool-vault-withdraw-build",
    ),
    path(
        "<str:short_code>/vault/submit/",
        VaultSubmitView.as_view(),
        name="pool-vault-submit",
    ),
    path(
        "<str:short_code>/vault/state/",
        VaultStateView.as_view(),
        name="pool-vault-state",
    ),
    path(
        "<str:short_code>/vault/leaderboard/",
        VaultLeaderboardView.as_view(),
        name="pool-vault-leaderboard",
    ),
]
