FROM python:3.13-slim

WORKDIR /

RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    libglib2.0-0 \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libxshmfence1 libx11-6 libx11-xcb1 libxcb1 libxcb-dri3-0 \
    libxext6 libxrender1 libxtst6 libpango-1.0-0 \
    libpangocairo-1.0-0 libcairo2 libatspi2.0-0 \
    fonts-liberation libcurl4 libegl1 libopengl0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Do NOT run playwright install-deps
RUN playwright install chromium

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]