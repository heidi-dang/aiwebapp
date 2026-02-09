FROM node:20-slim

# Install essential tools for code execution and analysis
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    make \
    g++ \
    curl \
    wget \
    unzip \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security (optional, but good practice)
# For now, we keep root to allow easy package installation by the agent if needed,
# or we can switch to 'node' user.
# Let's stick to root for MVP flexibility, but in a real prod env we'd drop privileges.

WORKDIR /app

# Keep the container running
CMD ["tail", "-f", "/dev/null"]
