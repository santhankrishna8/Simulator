// Example sketches. Plain JS so the compile-service prebuild script can read them too.

export const SKETCHES = {
  blink: `// Blink: switch an LED on and off every half second.
// The small LED marked L on the board is wired to pin 13 as well.

const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);   // make pin 13 an output
}

void loop() {
  digitalWrite(ledPin, HIGH);  // 5 volts out
  delay(500);                  // wait half a second
  digitalWrite(ledPin, LOW);   // 0 volts out
  delay(500);
}
`,

  blinkfast: `// Blink, faster: the same sketch with a 200 ms delay.

const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH);
  delay(200);
  digitalWrite(ledPin, LOW);
  delay(200);
}
`,

  fade: `// Fade: pulse-width modulation (PWM) makes an LED look dimmer.
// analogWrite(pin, 0..255) switches the pin on and off about 490 times a
// second. The longer it stays on, the brighter the LED looks.

const int ledPin = 9;      // pins marked ~ can do PWM
int brightness = 0;
int step = 5;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  analogWrite(ledPin, brightness);

  brightness = brightness + step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;            // turn around at either end
  }
  delay(30);
}
`,

  button: `// Button: light an LED while a button is held.
// INPUT_PULLUP turns on a built-in resistor that pulls the pin up to 5 volts.
// Pressing the button connects the pin to ground, so it reads LOW.

const int buttonPin = 2;
const int ledPin = 8;
bool wasPressed = false;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  bool pressed = (digitalRead(buttonPin) == LOW);
  digitalWrite(ledPin, pressed);

  if (pressed != wasPressed) {           // only print when it changes
    Serial.println(pressed ? "Button pressed" : "Button released");
    wasPressed = pressed;
  }
}
`,

  knob: `// Knob: read a voltage with analogRead() and use it to dim an LED.
// The potentiometer's middle pin gives 0 to 5 volts. analogRead turns that
// into a number from 0 to 1023.

const int potPin = A0;
const int ledPin = 9;

void setup() {
  Serial.begin(9600);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int raw = analogRead(potPin);          // 0 to 1023
  float volts = raw * 5.0 / 1023.0;
  analogWrite(ledPin, raw / 4);          // scale to 0 to 255

  Serial.print("reading ");
  Serial.print(raw);
  Serial.print("   ");
  Serial.print(volts, 2);
  Serial.println(" V");
  delay(250);
}
`,

  nightlight: `// Night light: the darker it gets, the brighter the LED.
// The light sensor and a 10 k resistor make a voltage divider. More light
// lowers the sensor's resistance, which raises the voltage on A1.

const int sensorPin = A1;
const int ledPin = 6;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(sensorPin);          // 0 dark .. 1023 bright
  int glow = map(light, 0, 1023, 255, 0);     // flip it around
  analogWrite(ledPin, constrain(glow, 0, 255));

  Serial.print("light ");
  Serial.println(light);
  delay(200);
}
`,

  serial: `// Serial control: type 1 or 0 in the Serial Monitor to switch the L LED.
// Serial.available() says how many characters are waiting to be read.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Type 1 to turn the LED on, 0 to turn it off.");
}

void loop() {
  if (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '1') {
      digitalWrite(LED_BUILTIN, HIGH);
      Serial.println("LED on");
    } else if (c == '0') {
      digitalWrite(LED_BUILTIN, LOW);
      Serial.println("LED off");
    }
  }
}
`,

  rgb: `// RGB colour cycle: three PWM pins mix red, green and blue light.
// Each colour has its own resistor. analogWrite(pin, 0..255) sets how bright.

const int redPin = 9;
const int greenPin = 10;
const int bluePin = 11;

void setColor(int red, int green, int blue) {
  analogWrite(redPin, red);
  analogWrite(greenPin, green);
  analogWrite(bluePin, blue);
}

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
}

void loop() {
  setColor(255, 0, 0);     // red
  delay(700);
  setColor(255, 120, 0);   // orange
  delay(700);
  setColor(0, 255, 0);     // green
  delay(700);
  setColor(0, 255, 255);   // cyan
  delay(700);
  setColor(0, 0, 255);     // blue
  delay(700);
  setColor(255, 0, 255);   // magenta
  delay(700);
  setColor(255, 255, 255); // all three: white
  delay(700);
}
`,

  sevenseg: `// Seven-segment counter: show the digits 0 to 9, one segment per pin.
// Each digit is a pattern of seven bits. Bit 0 is segment a, bit 1 is b, and so on up to g.

const int segPins[7] = {2, 3, 4, 5, 6, 7, 8};   // a, b, c, d, e, f, g

const byte digits[10] = {
  0b0111111,  // 0
  0b0000110,  // 1
  0b1011011,  // 2
  0b1001111,  // 3
  0b1100110,  // 4
  0b1101101,  // 5
  0b1111101,  // 6
  0b0000111,  // 7
  0b1111111,  // 8
  0b1101111   // 9
};

void show(int digit) {
  for (int s = 0; s < 7; s++) {
    digitalWrite(segPins[s], (digits[digit] >> s) & 1);
  }
}

void setup() {
  for (int s = 0; s < 7; s++) {
    pinMode(segPins[s], OUTPUT);
  }
}

void loop() {
  for (int d = 0; d < 10; d++) {
    show(d);
    delay(800);
  }
}
`,

  servo: `// Servo sweep: turn the horn from 0 to 180 degrees and back.
// The Servo library sends a pulse every 20 ms. 544 us means 0 degrees,
// 2400 us means 180 degrees, and write(angle) works out the pulse for you.

#include <Servo.h>

Servo arm;

void setup() {
  arm.attach(9);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    arm.write(angle);
    delay(15);                 // give the servo time to get there
  }
  for (int angle = 180; angle >= 0; angle -= 2) {
    arm.write(angle);
    delay(15);
  }
}
`,

  servoknob: `// Servo knob: a potentiometer steers the servo.
// analogRead gives 0 to 1023. map() rescales that to 0 to 180 degrees.

#include <Servo.h>

Servo arm;
const int potPin = A0;

void setup() {
  arm.attach(9);
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(potPin);
  int angle = map(reading, 0, 1023, 0, 180);
  arm.write(angle);

  Serial.print("angle ");
  Serial.println(angle);
  delay(100);
}
`,

  ultrasonic: `// Ultrasonic ruler: measure distance with an HC-SR04.
// A 10 us pulse on TRIG starts a measurement. ECHO then goes HIGH for as long
// as the sound took to bounce back. Sound travels about 29 us per centimetre,
// and the trip is there and back, so distance in cm = echo time / 58.

const int trigPin = 9;
const int echoPin = 10;

void setup() {
  Serial.begin(9600);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long echoTime = pulseIn(echoPin, HIGH, 30000);   // give up after 30 ms

  if (echoTime == 0) {
    Serial.println("nothing in range");
  } else {
    Serial.print(echoTime / 58.0, 1);
    Serial.println(" cm");
  }
  delay(300);
}
`,

  lcdhello: `// Hello LCD: print text on a 16x2 character display.
// LiquidCrystal lcd(rs, enable, d4, d5, d6, d7) says which pins are wired.
// The display is in 4-bit mode, so only D4 to D7 carry data.

#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);              // 16 columns, 2 rows
  lcd.print("Hello, world!");
}

void loop() {
  lcd.setCursor(0, 1);           // column 0, second row
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print(" s   ");
  delay(200);
}
`,

  pwmscope: `// PWM on the oscilloscope: the duty cycle steps between 25% and 75%.
// Probe the pin to see the square wave. A resistor and capacitor smooth it into
// a steady voltage, which A0 reads. Higher duty means higher average voltage.

const int pwmPin = 9;

void setup() {
  pinMode(pwmPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  analogWrite(pwmPin, 64);        // 25 % on
  delay(1500);
  Serial.print("25% duty, filtered voltage: ");
  Serial.print(analogRead(A0) * 5.0 / 1023.0, 2);
  Serial.println(" V");

  analogWrite(pwmPin, 191);       // 75 % on
  delay(1500);
  Serial.print("75% duty, filtered voltage: ");
  Serial.print(analogRead(A0) * 5.0 / 1023.0, 2);
  Serial.println(" V");
}
`,

  plotter: `// Plotter: print numbers and watch them graph in the Plotter tab.
// Print values separated by spaces, one line per sample. Put name: before
// a value to label its line.

const int potPin = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  float t = millis() / 1000.0;
  int knob = analogRead(potPin);

  Serial.print("knob:");
  Serial.print(knob);
  Serial.print(" wave:");
  Serial.println(512 + 400 * sin(t * 2.0));
  delay(40);
}
`,

  i2cscan: `// I2C scanner: find every device on the bus.
// I2C uses two wires, SDA (data) and SCL (clock), and every device has an
// address from 1 to 127. Asking an address and getting an answer (an ACK)
// means something is there.

#include <Wire.h>

void setup() {
  Serial.begin(9600);
  Wire.begin();
  Serial.println("Scanning the I2C bus...");

  int found = 0;
  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();   // 0 means the device answered
    if (error == 0) {
      Serial.print("Found a device at 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
      found++;
    }
  }

  if (found == 0) {
    Serial.println("No devices found. Check SDA, SCL and the power.");
  } else {
    Serial.println("Done.");
  }
}

void loop() {
}
`,

  oledhello: `// OLED: draw text and shapes on a 128x64 display over I2C.
// The Adafruit libraries keep a copy of the screen in memory. You draw into
// it, then display.display() sends the whole picture to the screen.
//
// Note: display.begin() only says whether it found memory for the picture. It
// cannot tell if the screen is really wired up, so if nothing shows, run the
// I2C scanner sketch to check the display answers.

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Serial.begin(9600);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {   // 0x3C is the display's address
    Serial.println("Not enough memory for the display");
    for (;;) {}                                        // stop here
  }
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  int knob = analogRead(A0);

  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println("Hello,");
  display.println("OLED!");

  display.drawRect(0, 42, 128, 16, SSD1306_WHITE);                        // an empty bar
  display.fillRect(2, 44, map(knob, 0, 1023, 0, 124), 12, SSD1306_WHITE); // filled to the knob
  display.display();
  delay(100);
}
`,
};
