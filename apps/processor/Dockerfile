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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/src/

CMD ["src.handler.handler"]
