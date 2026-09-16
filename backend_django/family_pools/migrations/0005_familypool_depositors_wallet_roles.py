from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("family_pools", "0004_familypool_asset_withdrawal_limits"),
    ]

    operations = [
        migrations.AddField(
            model_name="familypool",
            name="depositors",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="familypool",
            name="wallet_roles",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
