from django.urls import path

from .views import (
    BlendPositionView,
    BlendSubmitView,
    BlendSupplyBuildView,
    BlendWithdrawBuildView,
    BuildConfigureSignersView,
    BuildCreateAccountView,
    ConfirmPoolSetupView,
    FamilyPoolDepositCreateView,
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
]
