FROM php:8.4-cli-alpine

WORKDIR /app
COPY app/ /app/
RUN mkdir -p /app/data && chown -R www-data:www-data /app/data

USER www-data
EXPOSE 8793
CMD ["php", "-S", "0.0.0.0:8793", "-t", "/app"]
