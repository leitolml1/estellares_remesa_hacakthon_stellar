from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pools', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='pool',
            name='vault_registered',
            field=models.BooleanField(default=False),
        ),
    ]
