FROM php:8.4-cli-alpine

WORKDIR /app
COPY app/ /app/
COPY docker-entrypoint.sh /usr/local/bin/ato-docker-entrypoint
RUN apk add --no-cache su-exec \
  && chmod +x /usr/local/bin/ato-docker-entrypoint \
  && mkdir -p /app/data \
  && chown -R www-data:www-data /app/data

ENTRYPOINT ["/usr/local/bin/ato-docker-entrypoint"]
EXPOSE 8793
CMD ["php", "-S", "0.0.0.0:8793", "-t", "/app"]
