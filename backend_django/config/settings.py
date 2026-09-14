"""
Django settings for config project (Remesa Directa backend).
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes")


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-change-me",
)

# SECURITY WARNING: don't run with debug turned on in production!
# Default False a proposito: si alguna vez se te olvida setear la variable
# en un ambiente real (Render u otro), que falle "cerrado" (DEBUG off) y
# no al reves. En local, .env explicita DJANGO_DEBUG=true.
DEBUG = env_bool("DJANGO_DEBUG", False)

ALLOWED_HOSTS = [h.strip() for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

# Render inyecta el hostname publico del servicio en esta variable en
# runtime (algo asi como "remesa-directa-backend.onrender.com") - se suma
# solo si esta presente, sin que haga falta configurar nada a mano por
# cada deploy/nombre de servicio.
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

# Necesario para que el login del admin de Django (usa POST + CSRF) no
# falle detras del dominio de Render: Django exige que el Origin de un
# POST este en esta lista cuando no es localhost.
CSRF_TRUSTED_ORIGINS = [f"https://{host}" for host in ALLOWED_HOSTS if host not in ("localhost", "127.0.0.1")]

# Render (como cualquier PaaS detras de un reverse proxy) termina TLS en
# su borde y reenvia al proceso de gunicorn por HTTP interno: sin decirle
# a Django que confie en X-Forwarded-Proto, SECURE_SSL_REDIRECT vería
# todo como HTTP y entraria en loop de redirects infinito.
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
# HSTS no se activa aca a proposito: una vez que el navegador lo respeta,
# fuerza HTTPS durante todo SECURE_HSTS_SECONDS incluso si mas adelante
# hiciera falta volver atras - mejor que se prenda a mano cuando el
# dominio final este decidido, no como default silencioso de un deploy.


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "payments",
    "pools",
    "family_pools",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# Postgres solo guarda metadata (nota/categoria de pagos, datos de pools):
# el ledger de Stellar sigue siendo la fuente de verdad de montos/estados.
#
# DATABASE_URL apunta a Neon (Postgres serverless). dj_database_url parsea
# sslmode/channel_binding directo de la query string de la URL, asi que no
# hace falta setearlos aparte - alcanza con que vengan en la propia URL.

DATABASES = {
    "default": dj_database_url.parse(
        os.environ["DATABASE_URL"],
        conn_max_age=600,
    )
}


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files
#
# Esta API no tiene templates propios ni assets - lo unico que sirve
# STATIC_URL es el CSS/JS del admin de Django. Whitenoise lo sirve
# directo desde el proceso de gunicorn en Render (no hace falta nginx ni
# un servicio de static files aparte).

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

if DEBUG:
    # ManifestStaticFilesStorage exige haber corrido collectstatic (el
    # manifest no existe todavia en dev); con DEBUG=True ademas Django ya
    # sirve estos archivos solo via runserver.
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }
else:
    STORAGES = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}

# CORS: abierto en dev para que Leito pueda pegarle desde el frontend sin
# depender de en que puerto/host corra. Restringir antes de producción.
CORS_ALLOW_ALL_ORIGINS = env_bool("CORS_ALLOW_ALL_ORIGINS", True)


# Stellar / Horizon / Soroban

STELLAR_HORIZON_URL = os.environ.get("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org")
STELLAR_NETWORK_PASSPHRASE = os.environ.get(
    "STELLAR_NETWORK_PASSPHRASE", "Test SDF Network ; September 2015"
)
STELLAR_SOROBAN_RPC_URL = os.environ.get("STELLAR_SOROBAN_RPC_URL", "https://soroban-testnet.stellar.org")

# Blend Protocol (lending sobre Soroban, no es un contrato propio) - pool
# desplegado por el equipo de Blend en testnet.
BLEND_POOL_CONTRACT_ID = os.environ.get(
    "BLEND_POOL_CONTRACT_ID", "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF"
)
