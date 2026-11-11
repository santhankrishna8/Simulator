# Ubuntu 24.04 ships gcc-avr 7.3.0, the toolchain the Arduino AVR core is built and tested with.
FROM ubuntu:24.04

RUN apt-get update \
 && apt-get install -y --no-install-recommends nodejs gcc-avr avr-libc binutils-avr git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY setup.sh compile.mjs server.mjs ./
RUN ./setup.sh /opt/arduino \
 && apt-get purge -y git && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

ENV ARDUINO_ROOT=/opt/arduino PORT=8080
# The image's unprivileged user; compiles run in /tmp, everything else is read-only to it.
USER ubuntu
EXPOSE 8080
CMD ["node", "server.mjs"]
