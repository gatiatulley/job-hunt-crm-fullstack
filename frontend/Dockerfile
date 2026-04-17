FROM python:3.12-slim
WORKDIR /site
COPY . .
CMD ["python", "-m", "http.server", "5173", "--bind", "0.0.0.0"]
