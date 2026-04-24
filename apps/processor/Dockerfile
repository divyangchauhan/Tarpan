FROM public.ecr.aws/lambda/python:3.12

# WeasyPrint native deps: gobject/pango/cairo/fontconfig
# Lambda Python 3.12 is Amazon Linux 2023 — uses dnf
RUN dnf install -y \
    gobject-introspection \
    pango \
    cairo \
    gdk-pixbuf2 \
    libffi \
    fontconfig \
    && dnf clean all

# Pre-build fontconfig cache into /var/task so it's baked into the image.
# Without this, fontconfig rebuilds the cache on every cold start (no writable
# dirs in the Lambda sandbox), adding ~2–3 s to init time and spamming
# "No writable cache directories" warnings.
RUN mkdir -p /var/task/.fontconfig \
    && FONTCONFIG_PATH=/var/task/.fontconfig fc-cache -f -v
ENV FONTCONFIG_PATH=/var/task/.fontconfig

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/src/

CMD ["src.handler.handler"]
