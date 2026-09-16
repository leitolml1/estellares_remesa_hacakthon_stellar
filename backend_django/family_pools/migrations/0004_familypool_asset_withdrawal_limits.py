from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('family_pools', '0003_familypool_blend_principal'),
    ]

    operations = [
        migrations.AddField(
            model_name='familypool',
            name='asset_withdrawal_limits',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
