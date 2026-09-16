from django.urls import path

from .views import (
    AddDepositorView,
    AddSignerBuildView,
    AddSignerSubmitView,
    BlendPositionView,
    BlendSubmitView,
    BlendSupplyBuildView,
    BlendWithdrawBuildView,
    BuildConfigureSignersView,
    BuildCreateAccountView,
    ConfirmPoolSetupView,
    FamilyPoolDepositCreateView,
    FamilyPoolDetailView,
    FamilyPoolListView,
    TrustlineBuildView,
    TrustlineSubmitView,
    WithdrawalBuildView,
    WithdrawalSubmitView,
)

urlpatterns = [
    path("build-create-account/", BuildCreateAccountView.as_view(), name="family-pool-build-create-account"),
    path(
        "build-configure-signers/",
        BuildConfigureSignersView.as_view(),
        name="family-pool-build-configure-signers",
    ),
    path("confirm/", ConfirmPoolSetupView.as_view(), name="family-pool-confirm"),
    path("", FamilyPoolListView.as_view(), name="family-pool-list"),
    path(
        "<str:pool_account>/deposits/",
        FamilyPoolDepositCreateView.as_view(),
        name="family-pool-deposit-create",
    ),
    path(
        "<str:pool_account>/withdrawals/build/",
        WithdrawalBuildView.as_view(),
        name="family-pool-withdrawal-build",
    ),
    path(
        "<str:pool_account>/withdrawals/submit/",
        WithdrawalSubmitView.as_view(),
        name="family-pool-withdrawal-submit",
    ),
    path(
        "<str:pool_account>/trustlines/build/",
        TrustlineBuildView.as_view(),
        name="family-pool-trustline-build",
    ),
    path(
        "<str:pool_account>/trustlines/submit/",
        TrustlineSubmitView.as_view(),
        name="family-pool-trustline-submit",
    ),
    path(
        "<str:pool_account>/signers/build/",
        AddSignerBuildView.as_view(),
        name="family-pool-add-signer-build",
    ),
    path(
        "<str:pool_account>/signers/submit/",
        AddSignerSubmitView.as_view(),
        name="family-pool-add-signer-submit",
    ),
    path(
        "<str:pool_account>/depositors/",
        AddDepositorView.as_view(),
        name="family-pool-add-depositor",
    ),
    path(
        "<str:pool_account>/blend/supply/build/",
        BlendSupplyBuildView.as_view(),
        name="family-pool-blend-supply-build",
    ),
    path(
        "<str:pool_account>/blend/withdraw/build/",
        BlendWithdrawBuildView.as_view(),
        name="family-pool-blend-withdraw-build",
    ),
    path(
        "<str:pool_account>/blend/submit/",
        BlendSubmitView.as_view(),
        name="family-pool-blend-submit",
    ),
    path(
        "<str:pool_account>/blend/position/",
        BlendPositionView.as_view(),
        name="family-pool-blend-position",
    ),
    path("<str:pool_account>/", FamilyPoolDetailView.as_view(), name="family-pool-detail"),
]
