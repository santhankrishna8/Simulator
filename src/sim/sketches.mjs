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
};
