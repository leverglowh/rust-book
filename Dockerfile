# Multi-stage Dockerfile for The Rust Book (Full Stack)
# Note: Currently supports linux/amd64 only (matching CI workflow)
# Stage 1: Build the book
FROM --platform=linux/amd64 ubuntu:24.04 AS book-builder

# Build arguments (matching .github/workflows/main.yml)
ARG MDBOOK_VERSION=0.4.51
ARG MDBOOK_QUIZ_VERSION=0.4.0
ARG AQUASCOPE_VERSION=0.3.8
ARG AQUASCOPE_TOOLCHAIN=nightly-2024-12-15

# Install system dependencies including Rust
RUN apt-get update && apt-get install -y \
    curl \
    patchelf \
    git \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.85 --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Node.js and pnpm for JS extensions
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm@6.7.0

# Install Rust toolchains
RUN rustup set profile minimal && \
    rustup toolchain install 1.85 -c rust-docs && \
    rustup default 1.85

# Install Aquascope toolchain (required before downloading binaries)
RUN rustup toolchain install ${AQUASCOPE_TOOLCHAIN} -c rust-src,rustc-dev,llvm-tools-preview,miri && \
    cargo +${AQUASCOPE_TOOLCHAIN} miri setup

# Set LD_LIBRARY_PATH for Aquascope
ENV LD_LIBRARY_PATH=/root/.rustup/toolchains/${AQUASCOPE_TOOLCHAIN}-x86_64-unknown-linux-gnu/lib

# Download and install pre-built binaries (Ubuntu 24.04 has GLIBC 2.39+)
RUN mkdir -p /usr/local/bin && \
    curl -sSL https://github.com/rust-lang/mdBook/releases/download/v${MDBOOK_VERSION}/mdbook-v${MDBOOK_VERSION}-x86_64-unknown-linux-gnu.tar.gz | tar -xz -C /usr/local/bin && \
    curl -sSL https://github.com/cognitive-engineering-lab/mdbook-quiz/releases/download/v${MDBOOK_QUIZ_VERSION}/mdbook-quiz_x86_64-unknown-linux-gnu_full.tar.gz | tar -xz -C /usr/local/bin && \
    curl -sSL https://github.com/cognitive-engineering-lab/aquascope/releases/download/v${AQUASCOPE_VERSION}/aquascope-x86_64-unknown-linux-gnu.tar.gz | tar -xz -C /usr/local/bin

# Verify installations
RUN mdbook --version && \
    mdbook-quiz --version && \
    mdbook-aquascope --version

# Copy source files (including .git for telemetry build)
WORKDIR /book
COPY . .

# Build mdbook-trpl custom preprocessors
RUN cargo install --locked --path packages/mdbook-trpl

# Build JS extensions
WORKDIR /book/js-extensions
RUN pnpm init-repo

# Build the book
WORKDIR /book
RUN mdbook build

# Stage 2: Full-stack Node.js server
FROM --platform=linux/amd64 node:20-alpine

WORKDIR /app

# Copy server files
COPY server/package*.json ./
RUN npm ci --only=production

COPY server/index.js ./

# Copy built book from builder stage
COPY --from=book-builder /book/book ./public

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Default environment variables (can be overridden)
ENV PORT=3000 \
    DB_PATH=/app/data/rust-book.db \
    BOOK_PATH=/app/public \
    NODE_ENV=production

# Expose port (default, but can be changed via PORT env var)
EXPOSE ${PORT}

# Health check using PORT environment variable
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const port = process.env.PORT || 3000; require('http').get('http://localhost:' + port + '/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the full-stack server
CMD ["node", "index.js"]
