ARG NETBOX_BASE_IMAGE=docker.io/netboxcommunity/netbox:v4.5-4.0.2
FROM ${NETBOX_BASE_IMAGE}

COPY plugins/netbox_ot_security /opt/netbox/plugins/netbox_ot_security
RUN uv pip install --python /opt/netbox/venv/bin/python --no-cache-dir /opt/netbox/plugins/netbox_ot_security

COPY docker/netbox/configuration/plugins.py /etc/netbox/config/plugins.py
