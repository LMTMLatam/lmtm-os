# syntax=docker/dockerfile:1.20
FROM alpine:3.20
RUN echo "OK alpine base"
RUN apk add --no-cache nodejs npm 2>&1 | tail -3
RUN node --version
RUN npm --version
CMD ["sh", "-c", "echo FINAL_OK; node --version"]
