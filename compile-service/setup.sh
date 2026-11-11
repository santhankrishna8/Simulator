#!/usr/bin/env bash
# Fetch the official Arduino AVR core and the Servo library, then prebuild them
# into archives so each sketch only has to compile its own code.
#
#   ./setup.sh /opt/arduino
#
# Needs: git, avr-gcc, avr-g++, avr-ar (Debian/Ubuntu: gcc-avr avr-libc binutils-avr).
set -euo pipefail

ROOT="${1:?usage: setup.sh <install-dir>}"
CORE_TAG="${CORE_TAG:-1.8.6}"
SERVO_TAG="${SERVO_TAG:-1.2.2}"
LCD_TAG="${LCD_TAG:-1.0.7}"
GFX_TAG="${GFX_TAG:-1.11.9}"
SSD_TAG="${SSD_TAG:-2.5.9}"
BUSIO_TAG="${BUSIO_TAG:-1.15.0}"
CORE_DIR="${CORE_SRC:-}"

mkdir -p "$ROOT"
if [ -z "$CORE_DIR" ]; then
  CORE_DIR="$(mktemp -d)"
  git clone --quiet --depth 1 --branch "$CORE_TAG" https://github.com/arduino/ArduinoCore-avr.git "$CORE_DIR/core"
  CORE_DIR="$CORE_DIR/core"
fi
SERVO_DIR="${SERVO_SRC:-}"
if [ -z "$SERVO_DIR" ]; then
  SERVO_DIR="$(mktemp -d)/servo"
  git clone --quiet --depth 1 --branch "$SERVO_TAG" https://github.com/arduino-libraries/Servo.git "$SERVO_DIR"
fi

LCD_DIR="${LCD_SRC:-}"
if [ -z "$LCD_DIR" ]; then
  LCD_DIR="$(mktemp -d)/lcd"
  git clone --quiet --depth 1 --branch "$LCD_TAG" https://github.com/arduino-libraries/LiquidCrystal.git "$LCD_DIR"
fi

fetch() { # <env override> <repo> <tag> <name>
  local given="$1"
  if [ -n "$given" ]; then echo "$given"; return; fi
  local dir; dir="$(mktemp -d)/$4"
  git clone --quiet --depth 1 --branch "$3" "https://github.com/adafruit/$2.git" "$dir"
  echo "$dir"
}
GFX_DIR="$(fetch "${GFX_SRC:-}" Adafruit-GFX-Library "$GFX_TAG" gfx)"
SSD_DIR="$(fetch "${SSD_SRC:-}" Adafruit_SSD1306 "$SSD_TAG" ssd)"
BUSIO_DIR="$(fetch "${BUSIO_SRC:-}" Adafruit_BusIO "$BUSIO_TAG" busio)"

rm -rf "$ROOT/cores" "$ROOT/variants" "$ROOT/libraries" "$ROOT/build"
mkdir -p "$ROOT/cores" "$ROOT/variants" "$ROOT/libraries" "$ROOT/build"
cp -r "$CORE_DIR/cores/arduino" "$ROOT/cores/arduino"
cp -r "$CORE_DIR/variants/standard" "$ROOT/variants/standard"
for lib in Wire SPI EEPROM SoftwareSerial; do cp -r "$CORE_DIR/libraries/$lib" "$ROOT/libraries/$lib"; done
cp -r "$SERVO_DIR" "$ROOT/libraries/Servo"
rm -rf "$ROOT/libraries/Servo/.git"
cp -r "$LCD_DIR" "$ROOT/libraries/LiquidCrystal"
rm -rf "$ROOT/libraries/LiquidCrystal/.git"
cp -r "$GFX_DIR" "$ROOT/libraries/Adafruit_GFX"
cp -r "$SSD_DIR" "$ROOT/libraries/Adafruit_SSD1306"
cp -r "$BUSIO_DIR" "$ROOT/libraries/Adafruit_BusIO"
rm -rf "$ROOT"/libraries/Adafruit_*/.git "$ROOT"/libraries/Adafruit_*/examples

MCU=atmega328p
COMMON="-mmcu=$MCU -DF_CPU=16000000L -DARDUINO=10819 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR -I$ROOT/cores/arduino -I$ROOT/variants/standard"
CFLAGS="-c -Os -w -std=gnu11 -ffunction-sections -fdata-sections $COMMON"
CXXFLAGS="-c -Os -w -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics $COMMON"

build_dir() { # <src dir> <out archive> <extra include>
  local src="$1" out="$2" inc="${3:-}" tmp objs=()
  tmp="$(mktemp -d)"
  # Top level, utility/ (Wire) and avr/ (Servo); other chip families are skipped.
  local n=0
  for f in $(find "$src" "$src/utility" "$src/avr" -maxdepth 1 \( -name '*.c' -o -name '*.cpp' -o -name '*.S' \) 2>/dev/null); do
    n=$((n+1))
    local o="$tmp/$n-$(basename "$f").o"
    case "$f" in
      *.c)   avr-gcc  $CFLAGS $inc "$f" -o "$o" ;;
      *.cpp) avr-g++  $CXXFLAGS $inc "$f" -o "$o" ;;
      *.S)   avr-gcc  -c -x assembler-with-cpp $COMMON $inc "$f" -o "$o" ;;
    esac
    objs+=("$o")
  done
  avr-ar rcs "$out" "${objs[@]}"
  rm -rf "$tmp"
}

echo "building core"
build_dir "$ROOT/cores/arduino" "$ROOT/build/core.a"
for lib in Wire SPI EEPROM SoftwareSerial Servo LiquidCrystal Adafruit_BusIO Adafruit_GFX Adafruit_SSD1306; do
  echo "building $lib"
  src="$ROOT/libraries/$lib/src"
  [ -d "$src" ] || src="$ROOT/libraries/$lib"
  inc="-I$src -I$ROOT/libraries/Wire/src -I$ROOT/libraries/Wire/src/utility -I$ROOT/libraries/SPI/src -I$ROOT/libraries/Adafruit_BusIO -I$ROOT/libraries/Adafruit_GFX"
  # Wire needs its utility folder.
  [ -d "$src/utility" ] && inc="$inc -I$src/utility"
  [ -d "$src/avr" ] && inc="$inc -I$src/avr"
  build_dir "$src" "$ROOT/build/lib-$lib.a" "$inc"
done
echo "done: $ROOT"
