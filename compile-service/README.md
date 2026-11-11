# Compile service

Turns an Arduino sketch into a `.hex` file for the Uno. It calls `avr-gcc` directly with the official Arduino AVR core (1.8.6) and the Wire, SPI, EEPROM, SoftwareSerial, Servo and LiquidCrystal libraries. The core and libraries are prebuilt once, so a typical sketch compiles in well under a second.

The Next.js app calls it through `/api/compile`. Vercel cannot run `avr-gcc`, so this runs as its own small container.

## Run locally

```bash
sudo apt-get install -y gcc-avr avr-libc binutils-avr git
```

```bash
./setup.sh ~/arduino-root
```

```bash
ARDUINO_ROOT=~/arduino-root node server.mjs
```

Then set `COMPILE_SERVICE_URL=http://localhost:8080` in `.env.local` at the project root.

## Deploy

Any host that runs a Dockerfile works (Render, Fly.io, Railway, Cloud Run).

```bash
docker build -t simulator-compile .
```

Set `COMPILE_TOKEN` on the service to a long random string, and set the same value as `COMPILE_SERVICE_TOKEN` in Vercel, together with `COMPILE_SERVICE_URL`.

## Safety

Sketches are untrusted input. The service rejects `#include` of anything but a plain `<Library.h>`, rejects `.incbin` and `.include`, caps source size, kills compiles after 25 seconds, and queues at most two compiles at a time. These checks are a first layer: the container is the real boundary, so run it as a non-root user with no secrets and no access to your other services (the Dockerfile already uses the `node` user).
