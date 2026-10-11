# ==============================================================================
# Angband3D Cloud Container: Multi-stage Multi-Realm Engine + WebSocket Relay
# ==============================================================================

# Stage 1: Build Vanilla Angband + Variant Engines (FCB, Sil-Q, Hengband)
FROM ubuntu:22.04 AS engine-builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libncurses5-dev \
    pkg-config \
    ca-certificates \
    automake \
    autoconf \
    autopoint \
    libtool \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# 1. Clone & build official upstream Angband 4.2.6 release with bridge patch
RUN git clone --depth 1 --branch 4.2.6 https://github.com/angband/angband.git /src/engine
COPY engine-patch/0001-bridge-frontend.patch /src/
WORKDIR /src/engine
RUN git apply /src/0001-bridge-frontend.patch
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -DSUPPORT_BRIDGE_FRONTEND=ON \
             -DSUPPORT_GCU_FRONTEND=ON \
             -DSUPPORT_X11_FRONTEND=OFF \
             -DSUPPORT_SDL_FRONTEND=OFF \
             -DSUPPORT_SDL2_FRONTEND=OFF \
             -DSUPPORT_STATIC_LINKING=ON && \
    make -j$(nproc)

# 2. Build FrogComposBand
COPY variants/frogcomposband-src /src/variants/frogcomposband-src
WORKDIR /src/variants/frogcomposband-src
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    make -j$(nproc)

# 3. Build Sil-Q
COPY variants/silq-src /src/variants/silq-src
WORKDIR /src/variants/silq-src
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -DSUPPORT_X11_FRONTEND=OFF \
             -DSUPPORT_GCU_FRONTEND=ON && \
    make -j$(nproc) silq

# 4. Build Hengband
COPY variants/hengband-src /src/variants/hengband-src
WORKDIR /src/variants/hengband-src
RUN ./bootstrap && \
    ./configure --disable-x11 --enable-gcu --disable-net && \
    make -j$(nproc)

# Stage 2: Runtime Image with Node.js WebSocket Daemon
FROM node:18-slim AS runtime

# Install runtime libraries and UTF-8 locale support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libncursesw6 \
    libncurses6 \
    libtinfo6 \
    ca-certificates \
    locales \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

# Copy compiled Vanilla engine and game library
COPY --from=engine-builder /src/engine/build/game/angband /app/engine/angband
COPY --from=engine-builder /src/engine/build/game/lib /app/engine/lib

# Copy compiled multi-realm variant engines and libraries
COPY variants/frogcomposband/lib /app/variants/frogcomposband/lib
COPY --from=engine-builder /src/variants/frogcomposband-src/build/frogcomposband /app/variants/frogcomposband/bin/frogcomposband

COPY variants/silq/lib /app/variants/silq/lib
COPY --from=engine-builder /src/variants/silq-src/build/silq /app/variants/silq/bin/silq

COPY variants/hengband/lib /app/variants/hengband/lib
COPY --from=engine-builder /src/variants/hengband-src/src/hengband-bridge /app/variants/hengband/bin/hengband

# Setup cloud server daemon
COPY server/package*.json /app/server/
WORKDIR /app/server
RUN npm install --omit=dev

COPY server/src/ /app/server/src/
COPY server/public/ /app/public/
COPY engine-manifest.json /app/engine-manifest.json

# Prepare directories for persistent player saves, standalone dist, web client, and symlink hengband-en
RUN mkdir -p /data/save /app/dist /app/public \
             /app/variants/frogcomposband/lib/save \
             /app/variants/silq/lib/save \
             /app/variants/hengband/lib/save && \
    ln -sf /app/variants/hengband/bin/hengband /app/variants/hengband/bin/hengband-en && \
    chmod +x /app/engine/angband \
             /app/variants/frogcomposband/bin/frogcomposband \
             /app/variants/silq/bin/silq \
             /app/variants/hengband/bin/hengband \
             /app/variants/hengband/bin/hengband-en

VOLUME /data/save

ENV PORT=8080
ENV ENGINE_EXE=/app/engine/angband
ENV SAVE_DIR=/data/save
ENV DIST_DIR=/app/dist
ENV WEB_DIR=/app/public
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]

