# Stage 1: Build
FROM ubuntu:25.04 AS builder

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for building
RUN apt-get update && apt-get install -y \
    build-essential \
    golang \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the source code into the container
COPY . .

# Build the softrains binary
RUN go mod tidy
RUN go build -o softrains .

# Stage 2: Runtime
FROM ubuntu:25.04

# Set environment variables to avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies and openssl for certificate generation
RUN apt-get update && apt-get install -y \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the built binary from the builder stage
COPY --from=builder /app/softrains /app/softrains

# Copy the startup script
COPY --from=builder /app/config/softrains.json /app/config/softrains.json
COPY --from=builder /app/config/actions.json /app/config/actions.json
COPY --from=builder /app/docker/scripts/startup.sh /app/startup.sh

# Copy UI static and templates directories
COPY --from=builder /app/uiservice/static /app/static
COPY --from=builder /app/uiservice/templates /app/templates

# Make the startup script executable
RUN chmod +x /app/startup.sh

# Generate self-signed certificate with SAN softrains.com
RUN mkdir -p /etc/ssl/private && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/softrains.key \
    -out /etc/ssl/certs/softrains.crt \
    -subj "/CN=softrains.com" \
    -addext "subjectAltName=DNS:softrains.com"

# Set the entrypoint to the startup script
ENTRYPOINT ["/app/startup.sh"]
